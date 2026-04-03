// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let allSalesData   = []
let allPLData      = []
let currentChart   = null
let currentPLChart = null
let chartColor     = '#4F81BD'

// Drill-down state
let salesDrillLabel = null   // null = overview; "Jan 2024" = drilled into that period
let plDrillCategory = null   // null = overview; "Distribution Costs" = drilled into that category

const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function formatK(v) {
    return (v / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'K'
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function init() {
    const [sRes, pRes] = await Promise.all([fetch('/sales'), fetch('/pl')])
    allSalesData = await sRes.json()
    allPLData    = await pRes.json()
    populateSalesFilters()
    renderSalesChart()
    populatePLFilters()
}

// ═══════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        const tab = btn.dataset.tab
        document.getElementById('salesView').style.display = tab === 'sales' ? 'block' : 'none'
        document.getElementById('plView').style.display    = tab === 'pl'    ? 'block' : 'none'
    })
})

// ═══════════════════════════════════════════════
// SALES — FILTERS
// ═══════════════════════════════════════════════
function populateSalesFilters() {
    const d = allSalesData
    setOpts('companyFilter',  ['All', ...unique(d, 'company')])
    setOpts('yearFilter',     ['All', ...[...new Set(d.map(x => String(x.year)).filter(Boolean))].sort()])
    setOpts('monthFilter',    ['All', ...monthOrder.filter(m => d.some(x => x.month === m))])
    setOpts('brandFilter',    ['All', ...unique(d, 'brand')])
    setOpts('customerFilter', ['All', ...unique(d, 'customer')])
    setOpts('salesmanFilter', ['All', ...unique(d, 'salesman')])

    document.getElementById('companyFilter').addEventListener('change', () => {
        const sel = document.getElementById('companyFilter').value
        const sub = sel === 'All' ? d : d.filter(x => x.company === sel)
        setOpts('divisionFilter', ['All', ...unique(sub, 'division')])
        salesDrillLabel = null
        renderSalesChart()
    })

    ;['yearFilter','monthFilter','brandFilter','customerFilter','salesmanFilter','divisionFilter']
        .forEach(id => document.getElementById(id).addEventListener('change', () => {
            salesDrillLabel = null
            renderSalesChart()
        }))

    document.getElementById('resetBtn').addEventListener('click', () => {
        ;['companyFilter','divisionFilter','yearFilter','monthFilter','brandFilter','customerFilter','salesmanFilter']
            .forEach(id => document.getElementById(id).selectedIndex = 0)
        salesDrillLabel = null
        renderSalesChart()
    })
}

function getSalesFiltered() {
    const g = id => document.getElementById(id).value
    return allSalesData.filter(d => {
        if (g('companyFilter')  !== 'All' && d.company      !== g('companyFilter'))  return false
        if (g('divisionFilter') !== 'All' && d.division     !== g('divisionFilter')) return false
        if (g('yearFilter')     !== 'All' && String(d.year) !== g('yearFilter'))     return false
        if (g('monthFilter')    !== 'All' && d.month        !== g('monthFilter'))    return false
        if (g('brandFilter')    !== 'All' && d.brand        !== g('brandFilter'))    return false
        if (g('customerFilter') !== 'All' && d.customer     !== g('customerFilter')) return false
        if (g('salesmanFilter') !== 'All' && d.salesman     !== g('salesmanFilter')) return false
        return true
    })
}

// ═══════════════════════════════════════════════
// SALES — MAIN CHART (overview)
// ═══════════════════════════════════════════════
function renderSalesChart() {
    hideTooltip()

    // If we're drilled in, render drill view instead
    if (salesDrillLabel) {
        renderSalesDrill(salesDrillLabel)
        return
    }

    const data    = getSalesFiltered()
    const grouped = {}

    data.forEach(d => {
        const key = `${d.month} ${d.year}`
        if (!grouped[key]) grouped[key] = { sales: 0, rows: [] }
        grouped[key].sales += d.net_sales
        grouped[key].rows.push(d)
    })

    const sortedKeys = Object.keys(grouped).sort((a, b) => {
        const [aM, aY] = a.split(' '), [bM, bY] = b.split(' ')
        return aY !== bY ? parseInt(aY) - parseInt(bY) : monthOrder.indexOf(aM) - monthOrder.indexOf(bM)
    })

    const labels       = sortedKeys
    const values       = sortedKeys.map(k => grouped[k].sales)
    const rowsPerLabel = sortedKeys.map(k => grouped[k].rows)

    document.getElementById('kpiTotal').textContent   = formatK(values.reduce((s, v) => s + v, 0))
    document.getElementById('kpiPeriods').textContent = labels.length
    updateDrillBreadcrumb(null)

    if (currentChart) currentChart.destroy()

    const ctx  = document.getElementById('salesChart').getContext('2d')
    const nBars = labels.length || 1
    // Thin bars: cap category percentage so bars never get too fat
    const barPct = Math.min(0.35, 6 / nBars)

    currentChart = new Chart(ctx, {
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Net Sales',
                    data: values,
                    backgroundColor: chartColor + 'CC',
                    borderColor: chartColor,
                    borderWidth: 1,
                    borderRadius: 3,
                    categoryPercentage: barPct,
                    barPercentage: 0.9,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'Trend',
                    data: values,
                    borderColor: '#E8603C',
                    borderWidth: 2,
                    pointBackgroundColor: '#E8603C',
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    fill: false,
                    tension: 0.35,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 28 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true, position: 'top', align: 'end',
                    labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, color: '#666' }
                },
                tooltip: { enabled: false }
            },
            scales: {
                x: {
                    grid: { display: false }, border: { display: false },
                    ticks: { color: '#888', font: { size: 11 }, maxRotation: 45, minRotation: 30, autoSkip: labels.length > 28 }
                },
                y: { grid: { display: false }, border: { display: false }, ticks: { display: false } }
            },
            onHover: (event, activeElements) => {
                document.getElementById('salesChart').style.cursor = activeElements.length ? 'pointer' : 'default'
                if (activeElements.length > 0) {
                    showMiniBarTooltip(event, rowsPerLabel[activeElements[0].index], labels[activeElements[0].index])
                } else {
                    hideTooltip()
                }
            },
            onClick: (event, activeElements) => {
                if (!activeElements.length) return
                const idx   = activeElements[0].index
                salesDrillLabel = labels[idx]
                renderSalesDrill(salesDrillLabel)
            }
        },
        plugins: [{
            id: 'valueLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart
                chart.getDatasetMeta(0).data.forEach((bar, i) => {
                    ctx.save()
                    ctx.fillStyle = '#555'
                    ctx.font = '10px Segoe UI, sans-serif'
                    ctx.textAlign = 'center'
                    ctx.fillText(formatK(values[i]), bar.x, bar.y - 6)
                    ctx.restore()
                })
            }
        }]
    })
}

// ═══════════════════════════════════════════════
// SALES — DRILL-DOWN (top 10 brands + customers)
// ═══════════════════════════════════════════════
function renderSalesDrill(label) {
    hideTooltip()
    if (currentChart) currentChart.destroy()

    const [mon, yr] = label.split(' ')
    const rows = getSalesFiltered().filter(d => d.month === mon && String(d.year) === yr)

    // Aggregate brands
    const brandMap = {}, custMap = {}
    rows.forEach(r => {
        const b = r.brand    || 'Unknown'
        const c = r.customer || 'Unknown'
        if (!brandMap[b]) brandMap[b] = 0
        if (!custMap[c])  custMap[c]  = 0
        brandMap[b] += r.net_sales
        custMap[c]  += r.net_sales
    })

    const top10Brands = Object.entries(brandMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
    const top10Custs  = Object.entries(custMap).sort((a, b)  => b[1] - a[1]).slice(0, 10)

    // Update breadcrumb & KPIs
    const total = rows.reduce((s, r) => s + r.net_sales, 0)
    document.getElementById('kpiTotal').textContent   = formatK(total)
    document.getElementById('kpiPeriods').textContent = label
    updateDrillBreadcrumb(label)

    const ctx = document.getElementById('salesChart').getContext('2d')

    currentChart = new Chart(ctx, {
        data: {
            labels: top10Brands.map(([b]) => b),
            datasets: [
                {
                    type: 'bar',
                    label: 'Top Brands',
                    data: top10Brands.map(([, v]) => v),
                    backgroundColor: chartColor + 'CC',
                    borderColor: chartColor,
                    borderWidth: 1,
                    borderRadius: 3,
                    categoryPercentage: 0.4,
                    barPercentage: 0.8,
                    yAxisID: 'yBrand',
                    xAxisID: 'xBrand'
                },
                {
                    type: 'bar',
                    label: 'Top Customers',
                    data: top10Custs.map(([, v]) => v),
                    backgroundColor: '#8E6BBF' + 'CC',
                    borderColor: '#8E6BBF',
                    borderWidth: 1,
                    borderRadius: 3,
                    categoryPercentage: 0.4,
                    barPercentage: 0.8,
                    yAxisID: 'yCust',
                    xAxisID: 'xCust'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 28 } },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: {
                    display: true, position: 'top', align: 'end',
                    labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, color: '#666' }
                },
                tooltip: {
                    callbacks: {
                        label: item => ` ${formatK(item.raw)}`
                    }
                }
            },
            scales: {
                xBrand: {
                    type: 'category',
                    labels: top10Brands.map(([b]) => truncate(b, 14)),
                    position: 'bottom',
                    grid: { display: false }, border: { display: false },
                    ticks: { color: '#4F81BD', font: { size: 10, weight: '500' }, maxRotation: 40, minRotation: 30 }
                },
                xCust: {
                    type: 'category',
                    labels: top10Custs.map(([c]) => truncate(c, 14)),
                    position: 'top',
                    grid: { display: false }, border: { display: false },
                    ticks: { color: '#8E6BBF', font: { size: 10, weight: '500' }, maxRotation: 40, minRotation: 30 }
                },
                yBrand: {
                    position: 'left',
                    grid: { display: false }, border: { display: false },
                    ticks: { display: false }
                },
                yCust: {
                    position: 'right',
                    grid: { display: false }, border: { display: false },
                    ticks: { display: false }
                }
            },
            onHover: (event, activeElements) => {
                document.getElementById('salesChart').style.cursor = 'default'
            },
            onClick: (event, activeElements) => {
                // Clicking again in drill view exits back to overview
                if (activeElements.length === 0) {
                    salesDrillLabel = null
                    renderSalesChart()
                }
            }
        },
        plugins: [{
            id: 'drillValueLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart
                chart.data.datasets.forEach((dataset, di) => {
                    const meta = chart.getDatasetMeta(di)
                    meta.data.forEach((bar, i) => {
                        ctx.save()
                        ctx.fillStyle = di === 0 ? '#4F81BD' : '#8E6BBF'
                        ctx.font = '10px Segoe UI, sans-serif'
                        ctx.textAlign = 'center'
                        ctx.fillText(formatK(dataset.data[i]), bar.x, bar.y - 5)
                        ctx.restore()
                    })
                })
            }
        }]
    })
}

function updateDrillBreadcrumb(label) {
    const bc = document.getElementById('drillBreadcrumb')
    if (!label) {
        bc.style.display = 'none'
        document.getElementById('chartTitle').textContent = 'Net Sales by Period · Bars = Sales · Line = Trend'
    } else {
        bc.style.display = 'flex'
        document.getElementById('drillLabel').textContent = label
        document.getElementById('chartTitle').textContent = `Drill-down: ${label}`
    }
}

// ═══════════════════════════════════════════════
// SALES — HOVER TOOLTIP (overview only)
// ═══════════════════════════════════════════════
function showMiniBarTooltip(event, rows, label) {
    let t = document.getElementById('miniTooltip')
    if (!t) {
        t = document.createElement('div')
        t.id = 'miniTooltip'
        t.style.cssText = 'position:fixed;pointer-events:none;background:#fff;border:0.5px solid #ddd;border-radius:10px;padding:14px 16px;box-shadow:0 6px 24px rgba(0,0,0,0.10);z-index:9999;min-width:260px;max-width:300px;'
        document.body.appendChild(t)
    }
    const bs = {}
    rows.forEach(r => { const b = r.brand || 'Unknown'; if (!bs[b]) bs[b] = 0; bs[b] += r.net_sales })
    const top10  = Object.entries(bs).sort((a, b) => b[1] - a[1]).slice(0, 10)
    if (!top10.length) return
    const maxVal = top10[0][1]
    let html = `<div style="font-size:12px;font-weight:600;color:#222;margin-bottom:10px;padding-bottom:8px;border-bottom:0.5px solid #eee;">${label} · click to drill down</div>`
    top10.forEach(([brand, val], i) => {
        const pct = Math.round((val / maxVal) * 100)
        html += `<div style="margin-bottom:7px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <span style="font-size:11px;color:#555;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i+1}. ${brand}</span>
                <span style="font-size:11px;font-weight:600;color:#333;margin-left:8px;white-space:nowrap;">${formatK(val)}</span>
            </div>
            <div style="background:#f2f2f2;border-radius:3px;height:5px;">
                <div style="background:${chartColor};border-radius:3px;height:5px;width:${pct}%;"></div>
            </div>
        </div>`
    })
    t.innerHTML = html
    const tx = event.native.clientX, ty = event.native.clientY
    t.style.left = (tx + 20 + 300 > window.innerWidth  ? tx - 310 : tx + 20) + 'px'
    t.style.top  = (ty + 20 + 320 > window.innerHeight ? ty - 320 : ty + 20) + 'px'
    t.style.display = 'block'
}

function hideTooltip() {
    const t = document.getElementById('miniTooltip')
    if (t) t.style.display = 'none'
}
document.addEventListener('mouseleave', hideTooltip)

// ═══════════════════════════════════════════════
// P&L — FILTERS
// ═══════════════════════════════════════════════
function populatePLFilters() {
    const companies = ['All', ...new Set(allPLData.map(d => d.company).filter(Boolean))]
    const years     = ['All', ...[...new Set(allPLData.map(d => d.year).filter(Boolean))].sort()]
    const months    = ['All', ...monthOrder.filter(m => allPLData.some(d => d.month === m))]

    setOpts('plCompanyFilter', companies)
    setOpts('plYearFilter',    years)
    setOpts('plMonthFilter',   months)

    ;['plCompanyFilter','plYearFilter','plMonthFilter'].forEach(id =>
        document.getElementById(id).addEventListener('change', () => {
            plDrillCategory = null
            renderPL()
        })
    )

    document.getElementById('plResetBtn').addEventListener('click', () => {
        ;['plCompanyFilter','plYearFilter','plMonthFilter'].forEach(id => document.getElementById(id).selectedIndex = 0)
        plDrillCategory = null
        renderPL()
    })

    renderPL()
}

function getPLFiltered() {
    const g = id => document.getElementById(id).value
    return allPLData.filter(d => {
        if (g('plCompanyFilter') !== 'All' && d.company !== g('plCompanyFilter')) return false
        if (g('plYearFilter')    !== 'All' && d.year    !== g('plYearFilter'))    return false
        if (g('plMonthFilter')   !== 'All' && d.month   !== g('plMonthFilter'))   return false
        return true
    })
}

// ═══════════════════════════════════════════════
// P&L — MAIN VIEW
// ═══════════════════════════════════════════════
function renderPL() {
    if (plDrillCategory) { renderPLDrill(plDrillCategory); return }

    const data = getPLFiltered()
    const agg  = {}
    data.forEach(row => {
        const cat = row.sort
        if (!agg[cat]) agg[cat] = { balance: 0 }
        agg[cat].balance += row.balance
    })

    const grossSales  = -(agg['Sales of Goods']?.balance           || 0)
    const costOfSales =   agg['Cost of Sales']?.balance            || 0
    const grossProfit = grossSales - costOfSales
    const otherIncome = -(agg['Other Income']?.balance             || 0)
    const fxGain      = -(agg['Gain on foreign exchange']?.balance || 0)
    const totalOther  = otherIncome + fxGain
    const distCosts   =   agg['Distribution Costs']?.balance       || 0
    const adminCosts  =   agg['Administrative expenses']?.balance  || 0
    const finCost     =   agg['Finance Cost']?.balance             || 0
    const totalOpEx   = distCosts + adminCosts + finCost
    const netProfit   = grossProfit + totalOther - totalOpEx
    const gpPct       = grossSales ? ((grossProfit / grossSales) * 100).toFixed(1) : '0.0'
    const npPct       = grossSales ? ((netProfit   / grossSales) * 100).toFixed(1) : '0.0'

    document.getElementById('plKpiRevenue').textContent = formatK(grossSales)
    document.getElementById('plKpiGP').textContent      = formatK(grossProfit) + ' (' + gpPct + '%)'
    document.getElementById('plKpiNP').textContent      = formatK(netProfit)   + ' (' + npPct + '%)'
    document.getElementById('plKpiOpex').textContent    = formatK(totalOpEx)

    // Drillable categories — these rows get a click cursor + data-cat attribute
    const drillable = new Set(['Cost of Sales','Other Income','Distribution Costs','Administrative expenses','Finance Cost'])

    const rows = [
        { label: 'Gross Sales',               value: grossSales,   style: 'revenue'  },
        { label: 'Cost of Sales',             value: -costOfSales, style: 'expense',  cat: 'Cost of Sales',           indent: true },
        { label: 'GROSS PROFIT',              value: grossProfit,  style: 'subtotal' },
        { label: '',                          value: null,         style: 'spacer'   },
        { label: 'Other Income',              value: otherIncome,  style: 'revenue',  cat: 'Other Income',            indent: true },
        { label: 'FX Gain / (Loss)',          value: fxGain,       style: 'revenue',  cat: 'Gain on foreign exchange',indent: true },
        { label: 'Total Other Income',        value: totalOther,   style: 'subtotal' },
        { label: '',                          value: null,         style: 'spacer'   },
        { label: 'Distribution Costs',        value: -distCosts,   style: 'expense',  cat: 'Distribution Costs',      indent: true },
        { label: 'Administrative Expenses',   value: -adminCosts,  style: 'expense',  cat: 'Administrative expenses', indent: true },
        { label: 'Finance Cost',              value: -finCost,     style: 'expense',  cat: 'Finance Cost',            indent: true },
        { label: 'Total Operating Expenses',  value: -totalOpEx,   style: 'subtotal' },
        { label: '',                          value: null,         style: 'spacer'   },
        { label: 'NET PROFIT / (LOSS)',       value: netProfit,    style: 'net'      }
    ]

    document.getElementById('plTableBody').innerHTML = rows.map(r => {
        if (r.style === 'spacer') return '<tr><td colspan="3" style="height:8px;"></td></tr>'
        const neg    = r.value !== null && r.value < 0
        const valStr = r.value !== null ? (neg ? '(' + formatK(Math.abs(r.value)) + ')' : formatK(r.value)) : ''
        const pctStr = grossSales && r.value !== null ? ((r.value / grossSales) * 100).toFixed(1) + '%' : ''
        const ind    = r.indent ? 'padding-left:28px;' : 'padding-left:12px;'
        const isDrill = r.cat ? true : false

        let tr = '', td2 = ''
        if (r.style === 'net') {
            tr  = 'background:#1a1a2e;color:#fff;font-weight:600;font-size:14px;'
            td2 = neg ? 'color:#ff8a80;' : 'color:#69f0ae;'
        } else if (r.style === 'subtotal') {
            tr  = 'background:#f8f9fb;font-weight:600;border-top:0.5px solid #e0e0e0;'
            td2 = neg ? 'color:#c0392b;' : ''
        } else {
            td2 = neg ? 'color:#c0392b;' : ''
        }

        const drillStyle = isDrill ? 'cursor:pointer;' : ''
        const drillAttr  = r.cat   ? `data-cat="${r.cat}"` : ''
        const drillHint  = isDrill ? ' <span style="font-size:10px;color:#bbb;margin-left:4px;">▶</span>' : ''

        return `<tr style="${tr}${drillStyle}" ${drillAttr} class="${isDrill ? 'drill-row' : ''}">
            <td style="padding:9px 8px;${ind}">${r.label}${drillHint}</td>
            <td style="padding:9px 8px;text-align:right;padding-right:16px;${td2}">${valStr}</td>
            <td style="padding:9px 8px;text-align:right;padding-right:16px;color:#999;font-size:12px;">${pctStr}</td>
        </tr>`
    }).join('')

    // Attach click listeners to drillable rows
    document.querySelectorAll('.drill-row').forEach(row => {
        row.addEventListener('click', () => {
            plDrillCategory = row.dataset.cat
            renderPLDrill(plDrillCategory)
        })
    })

    updatePLBreadcrumb(null)
    renderPLChart(grossSales, costOfSales, totalOther, distCosts, adminCosts, finCost, netProfit)
}

// ═══════════════════════════════════════════════
// P&L — DRILL-DOWN (line items in a category)
// ═══════════════════════════════════════════════
function renderPLDrill(category) {
    const data = getPLFiltered().filter(d => d.sort === category)

    // Aggregate by account name
    const itemMap = {}
    data.forEach(row => {
        const key = row.account_name || row.account_no
        if (!itemMap[key]) itemMap[key] = 0
        itemMap[key] += row.balance
    })

    // For revenue categories, negate so positives show as income
    const isRevenue = ['Sales of Goods','Other Income','Gain on foreign exchange'].includes(category)
    const items = Object.entries(itemMap)
        .map(([name, bal]) => [name, isRevenue ? -bal : bal])
        .filter(([, v]) => Math.abs(v) > 0.01)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

    updatePLBreadcrumb(category)

    // Replace table with drill table
    document.getElementById('plTableBody').innerHTML = [
        `<tr style="background:#f8f9fb;">
            <td colspan="3" style="padding:8px 12px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;">
                ${category} — Line Items
                <span id="plBackBtn" style="float:right;cursor:pointer;color:#4F81BD;font-size:11px;font-weight:500;">← Back to P&L</span>
            </td>
        </tr>`,
        ...items.map(([name, val]) => {
            const neg    = val < 0
            const valStr = neg ? '(' + formatK(Math.abs(val)) + ')' : formatK(val)
            const total  = items.reduce((s, [, v]) => s + Math.abs(v), 0)
            const pct    = total ? ((Math.abs(val) / total) * 100).toFixed(1) + '%' : ''
            return `<tr>
                <td style="padding:8px 12px 8px 24px;font-size:12px;color:#444;">${name}</td>
                <td style="padding:8px 16px 8px 8px;text-align:right;font-size:12px;${neg ? 'color:#c0392b;' : ''}">${valStr}</td>
                <td style="padding:8px 16px 8px 8px;text-align:right;font-size:11px;color:#999;">${pct}</td>
            </tr>`
        }),
        `<tr style="background:#f8f9fb;font-weight:600;border-top:0.5px solid #e0e0e0;">
            <td style="padding:9px 12px;">Total</td>
            <td style="padding:9px 16px 9px 8px;text-align:right;">${formatK(items.reduce((s,[,v]) => s + v, 0))}</td>
            <td style="padding:9px 16px 9px 8px;text-align:right;font-size:11px;color:#999;">100%</td>
        </tr>`
    ].join('')

    document.getElementById('plBackBtn').addEventListener('click', () => {
        plDrillCategory = null
        renderPL()
    })

    // Replace waterfall with horizontal bar chart of line items (top 15)
    renderPLDrillChart(category, items.slice(0, 15))
}

function renderPLDrillChart(category, items) {
    if (currentPLChart) currentPLChart.destroy()

    const labels = items.map(([n]) => truncate(n, 20))
    const values = items.map(([, v]) => Math.abs(v))
    const colors = items.map(([, v]) => v < 0 ? '#E8603C' : '#4F81BD')

    const ctx = document.getElementById('plChart').getContext('2d')
    currentPLChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: category,
                data: values,
                backgroundColor: colors,
                borderRadius: 3,
                categoryPercentage: 0.5,
                barPercentage: 0.8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: item => ' ' + formatK(item.raw)
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { display: false } },
                y: {
                    grid: { display: false }, border: { display: false },
                    ticks: { color: '#555', font: { size: 10 } }
                }
            }
        }
    })
}

function updatePLBreadcrumb(category) {
    const bc = document.getElementById('plDrillBreadcrumb')
    if (!category) {
        bc.style.display = 'none'
    } else {
        bc.style.display = 'flex'
        document.getElementById('plDrillLabel').textContent = category
    }
}

// ═══════════════════════════════════════════════
// P&L — WATERFALL CHART (overview)
// ═══════════════════════════════════════════════
function renderPLChart(revenue, cogs, otherInc, dist, admin, finance, net) {
    if (currentPLChart) currentPLChart.destroy()
    const grossProfit = revenue - cogs
    const opex        = dist + admin + finance
    const labels = ['Revenue','Cost of Sales','Gross Profit','Other Income','OpEx','Net Profit']
    const bases  = [0, grossProfit, grossProfit, grossProfit + otherInc, grossProfit + otherInc - opex, 0]
    const vals   = [revenue, cogs, grossProfit, otherInc, opex, net]
    const colors = ['#4F81BD','#E8603C','#27AE60','#2ECC71','#E8603C', net >= 0 ? '#27AE60' : '#E8603C']

    const ctx = document.getElementById('plChart').getContext('2d')
    currentPLChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'base', data: bases, backgroundColor: 'transparent', stack: 'wf' },
                { label: 'val',  data: vals.map(v => Math.abs(v)), backgroundColor: colors, borderRadius: 3, stack: 'wf',
                  categoryPercentage: 0.45, barPercentage: 0.85 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: item => item.datasetIndex === 0 ? null : ' ' + formatK(vals[item.dataIndex]) } }
            },
            scales: {
                x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: '#888', font: { size: 11 } } },
                y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { display: false } }
            }
        }
    })
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function unique(data, key) { return [...new Set(data.map(d => d[key]).filter(Boolean))] }
function setOpts(id, values) {
    const el = document.getElementById(id)
    if (el) el.innerHTML = values.map(v => `<option value="${v}">${v}</option>`).join('')
}
function truncate(str, n) { return str.length > n ? str.slice(0, n) + '…' : str }

document.getElementById('colorPicker').addEventListener('input', function () {
    chartColor = this.value
    if (!salesDrillLabel) renderSalesChart()
})

init()