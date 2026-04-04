// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let allSalesData   = []
let allPLData      = []
let currentChart   = null
let brandChart     = null
let custChart      = null
let currentPLChart = null
let plCompChart    = null
let chartColor     = '#4F81BD'

let salesDrillLabel = null
let plDrillCategory = null

const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function formatK(v) {
    return (v / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'K'
}
function truncate(str, n) { return str && str.length > n ? str.slice(0, n) + '…' : str }
function unique(data, key) { return [...new Set(data.map(d => d[key]).filter(Boolean))] }
function setOpts(id, values) {
    const el = document.getElementById(id)
    if (el) el.innerHTML = values.map(v => `<option value="${v}">${v}</option>`).join('')
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
async function init() {
    const [sRes, pRes] = await Promise.all([fetch('/sales'), fetch('/pl')])
    allSalesData = await sRes.json()
    allPLData    = await pRes.json()
    populateSalesFilters()
    renderSalesChart()
    populatePLFilters()
    populatePLCompareFilters()
}

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        const tab = btn.dataset.tab
        document.getElementById('salesView').style.display      = tab === 'sales'     ? 'block' : 'none'
        document.getElementById('plView').style.display         = tab === 'pl'        ? 'block' : 'none'
        document.getElementById('plCompareView').style.display  = tab === 'plCompare' ? 'block' : 'none'
    })
})

// ═══════════════════════════════════════════════════════════
// SALES — FILTERS
// ═══════════════════════════════════════════════════════════
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
        closeSalesDrill()
        renderSalesChart()
    })

    ;['yearFilter','monthFilter','brandFilter','customerFilter','salesmanFilter','divisionFilter']
        .forEach(id => document.getElementById(id).addEventListener('change', () => {
            closeSalesDrill()
            renderSalesChart()
        }))

    document.getElementById('resetBtn').addEventListener('click', () => {
        ;['companyFilter','divisionFilter','yearFilter','monthFilter','brandFilter','customerFilter','salesmanFilter']
            .forEach(id => document.getElementById(id).selectedIndex = 0)
        closeSalesDrill()
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

// ═══════════════════════════════════════════════════════════
// SALES — MAIN CHART
// ═══════════════════════════════════════════════════════════
let _salesLabels = [], _salesValues = [], _salesRows = []

function renderSalesChart() {
    hideTooltip()

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

    _salesLabels = sortedKeys
    _salesValues = sortedKeys.map(k => grouped[k].sales)
    _salesRows   = sortedKeys.map(k => grouped[k].rows)

    document.getElementById('kpiTotal').textContent   = formatK(_salesValues.reduce((s, v) => s + v, 0))
    document.getElementById('kpiPeriods').textContent = _salesLabels.length

    if (currentChart) currentChart.destroy()

    const nBars    = _salesLabels.length || 1
    const barPct   = Math.min(0.35, 6 / nBars)
    const drillIdx = salesDrillLabel ? _salesLabels.indexOf(salesDrillLabel) : -1

    const bgColors = _salesValues.map((_, i) =>
        drillIdx === -1 ? chartColor + 'CC' : i === drillIdx ? chartColor : chartColor + '33')
    const brColors = _salesValues.map((_, i) =>
        drillIdx === -1 ? chartColor : i === drillIdx ? chartColor : chartColor + '33')

    const ctx = document.getElementById('salesChart').getContext('2d')

    currentChart = new Chart(ctx, {
        data: {
            labels: _salesLabels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Net Sales',
                    data: _salesValues,
                    backgroundColor: bgColors,
                    borderColor: brColors,
                    borderWidth: 1,
                    borderRadius: 3,
                    categoryPercentage: barPct,
                    barPercentage: 0.9,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'Trend',
                    data: _salesValues,
                    borderColor: '#E8603C',
                    borderWidth: 2,
                    pointBackgroundColor: _salesValues.map((_, i) =>
                        drillIdx === -1 || i === drillIdx ? '#E8603C' : '#E8603C33'),
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
                    ticks: { color: '#888', font: { size: 11 }, maxRotation: 45, minRotation: 30, autoSkip: _salesLabels.length > 28 }
                },
                y: { grid: { display: false }, border: { display: false }, ticks: { display: false } }
            },
            onHover: (event, activeElements) => {
                document.getElementById('salesChart').style.cursor = activeElements.length ? 'pointer' : 'default'
                if (activeElements.length > 0) {
                    showMiniBarTooltip(event, _salesRows[activeElements[0].index], _salesLabels[activeElements[0].index])
                } else {
                    hideTooltip()
                }
            },
            onClick: (event, activeElements) => {
                if (!activeElements.length) return
                const clicked = _salesLabels[activeElements[0].index]
                if (salesDrillLabel === clicked) {
                    closeSalesDrill()
                } else {
                    salesDrillLabel = clicked
                    renderSalesChart()
                    renderSalesDrillPanels()
                }
            }
        },
        plugins: [{
            id: 'valueLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart
                chart.getDatasetMeta(0).data.forEach((bar, i) => {
                    ctx.save()
                    ctx.fillStyle = drillIdx !== -1 && i !== drillIdx ? '#bbb' : '#555'
                    ctx.font = '10px Segoe UI, sans-serif'
                    ctx.textAlign = 'center'
                    ctx.fillText(formatK(_salesValues[i]), bar.x, bar.y - 6)
                    ctx.restore()
                })
            }
        }]
    })

    if (salesDrillLabel) renderSalesDrillPanels()
}

// ═══════════════════════════════════════════════════════════
// SALES — DRILL PANELS
// ═══════════════════════════════════════════════════════════
function renderSalesDrillPanels() {
    const label     = salesDrillLabel
    const [mon, yr] = label.split(' ')
    const rows      = getSalesFiltered().filter(d => d.month === mon && String(d.year) === yr)

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

    document.getElementById('salesDrillPanel').style.display = 'block'
    document.getElementById('salesDrillTitle').textContent   = `${label} — Breakdown`

    if (brandChart) { brandChart.destroy(); brandChart = null }
    if (custChart)  { custChart.destroy();  custChart  = null }

    brandChart = buildDrillChart('brandChart', top10Brands, chartColor)
    custChart  = buildDrillChart('custChart',  top10Custs,  '#8E6BBF')
}

function buildDrillChart(canvasId, top10, color) {
    const values = top10.map(([, v]) => v)
    return new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'bar',
        data: {
            labels: top10.map(([n]) => truncate(n, 20)),
            datasets: [{
                label: 'Sales',
                data: values,
                backgroundColor: color + 'CC',
                borderColor: color,
                borderWidth: 1,
                borderRadius: 3,
                categoryPercentage: Math.min(0.5, 5 / (top10.length || 1)),
                barPercentage: 0.85
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 22 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: item => ' ' + formatK(item.raw) } }
            },
            scales: {
                x: {
                    grid: { display: false }, border: { display: false },
                    ticks: { color: '#888', font: { size: 10 }, maxRotation: 40, minRotation: 30 }
                },
                y: { grid: { display: false }, border: { display: false }, ticks: { display: false } }
            }
        },
        plugins: [{
            id: 'drillValLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart
                chart.getDatasetMeta(0).data.forEach((bar, i) => {
                    ctx.save()
                    ctx.fillStyle = color
                    ctx.font = '10px Segoe UI, sans-serif'
                    ctx.textAlign = 'center'
                    ctx.fillText(formatK(values[i]), bar.x, bar.y - 5)
                    ctx.restore()
                })
            }
        }]
    })
}

function closeSalesDrill() {
    salesDrillLabel = null
    document.getElementById('salesDrillPanel').style.display = 'none'
    if (brandChart) { brandChart.destroy(); brandChart = null }
    if (custChart)  { custChart.destroy();  custChart  = null }
    // Re-render to remove bar highlighting
    if (currentChart) { currentChart.destroy(); currentChart = null }
}

// ═══════════════════════════════════════════════════════════
// SALES — HOVER TOOLTIP
// ═══════════════════════════════════════════════════════════
function showMiniBarTooltip(event, rows, label) {
    let t = document.getElementById('miniTooltip')
    if (!t) {
        t = document.createElement('div')
        t.id = 'miniTooltip'
        t.style.cssText = 'position:fixed;pointer-events:none;background:#fff;border:0.5px solid #ddd;border-radius:10px;padding:14px 16px;box-shadow:0 6px 24px rgba(0,0,0,0.10);z-index:9999;min-width:240px;max-width:280px;'
        document.body.appendChild(t)
    }
    const bs = {}
    rows.forEach(r => { const b = r.brand || 'Unknown'; if (!bs[b]) bs[b] = 0; bs[b] += r.net_sales })
    const top5   = Object.entries(bs).sort((a, b) => b[1] - a[1]).slice(0, 5)
    if (!top5.length) return
    const maxVal = top5[0][1]
    let html = `<div style="font-size:12px;font-weight:600;color:#222;margin-bottom:8px;padding-bottom:6px;border-bottom:0.5px solid #eee;">${label} · click to drill</div>`
    top5.forEach(([brand, val], i) => {
        const pct = Math.round((val / maxVal) * 100)
        html += `<div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                <span style="font-size:11px;color:#555;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i+1}. ${brand}</span>
                <span style="font-size:11px;font-weight:600;color:#333;margin-left:6px;white-space:nowrap;">${formatK(val)}</span>
            </div>
            <div style="background:#f2f2f2;border-radius:3px;height:4px;">
                <div style="background:${chartColor};border-radius:3px;height:4px;width:${pct}%;"></div>
            </div>
        </div>`
    })
    t.innerHTML = html
    const tx = event.native.clientX, ty = event.native.clientY
    t.style.left = (tx + 16 + 280 > window.innerWidth  ? tx - 290 : tx + 16) + 'px'
    t.style.top  = (ty + 16 + 260 > window.innerHeight ? ty - 260 : ty + 16) + 'px'
    t.style.display = 'block'
}

function hideTooltip() {
    const t = document.getElementById('miniTooltip')
    if (t) t.style.display = 'none'
}
document.addEventListener('mouseleave', hideTooltip)

// ═══════════════════════════════════════════════════════════
// P&L — FILTERS
// ═══════════════════════════════════════════════════════════
function populatePLFilters() {
    const d = allPLData
    setOpts('plCompanyFilter', ['All', ...unique(d, 'company')])
    setOpts('plYearFilter',    ['All', ...[...new Set(d.map(x => x.year).filter(Boolean))].sort()])
    setOpts('plMonthFilter',   ['All', ...monthOrder.filter(m => d.some(x => x.month === m))])

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
        if (g('plYearFilter')    !== 'All' && String(d.year) !== g('plYearFilter')) return false
        if (g('plMonthFilter')   !== 'All' && d.month !== g('plMonthFilter')) return false
        return true
    })
}

// ═══════════════════════════════════════════════════════════
// P&L — MAIN RENDER
// Uses actual DB field names: d.sort, d.balance, d.account_name
// ═══════════════════════════════════════════════════════════
function renderPL() {
    const data = getPLFiltered()
    const agg  = {}
    data.forEach(row => {
        if (!agg[row.sort]) agg[row.sort] = { balance: 0, rows: [] }
        agg[row.sort].balance += row.balance
        agg[row.sort].rows.push(row)
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
    document.getElementById('plKpiGP').textContent      = `${formatK(grossProfit)} (${gpPct}%)`
    document.getElementById('plKpiNP').textContent      = `${formatK(netProfit)} (${npPct}%)`
    document.getElementById('plKpiOpex').textContent    = formatK(totalOpEx)

    const rows = [
        { label: 'Gross Sales',               value: grossSales,   style: 'revenue'                                                                                      },
        { label: 'Cost of Sales',             value: -costOfSales, style: 'expense',  cat: 'Cost of Sales',            aggRows: agg['Cost of Sales']?.rows,            isRevenue: false, indent: true },
        { label: 'GROSS PROFIT',              value: grossProfit,  style: 'subtotal'                                                                                     },
        { label: '',                          value: null,         style: 'spacer'                                                                                       },
        { label: 'Other Income',              value: otherIncome,  style: 'revenue',  cat: 'Other Income',             aggRows: agg['Other Income']?.rows,             isRevenue: true,  indent: true },
        { label: 'FX Gain / (Loss)',          value: fxGain,       style: 'revenue',  cat: 'Gain on foreign exchange', aggRows: agg['Gain on foreign exchange']?.rows, isRevenue: true,  indent: true },
        { label: 'Total Other Income',        value: totalOther,   style: 'subtotal'                                                                                     },
        { label: '',                          value: null,         style: 'spacer'                                                                                       },
        { label: 'Distribution Costs',        value: -distCosts,   style: 'expense',  cat: 'Distribution Costs',       aggRows: agg['Distribution Costs']?.rows,       isRevenue: false, indent: true },
        { label: 'Administrative Expenses',   value: -adminCosts,  style: 'expense',  cat: 'Administrative expenses',  aggRows: agg['Administrative expenses']?.rows,  isRevenue: false, indent: true },
        { label: 'Finance Cost',              value: -finCost,     style: 'expense',  cat: 'Finance Cost',             aggRows: agg['Finance Cost']?.rows,             isRevenue: false, indent: true },
        { label: 'Total Operating Expenses',  value: -totalOpEx,   style: 'subtotal'                                                                                     },
        { label: '',                          value: null,         style: 'spacer'                                                                                       },
        { label: 'NET PROFIT / (LOSS)',       value: netProfit,    style: 'net'                                                                                          }
    ]

    let html = ''
    rows.forEach(r => {
        if (r.style === 'spacer') { html += '<tr><td colspan="3" style="height:8px;"></td></tr>'; return }

        const neg     = r.value !== null && r.value < 0
        const valStr  = r.value !== null ? (neg ? '(' + formatK(Math.abs(r.value)) + ')' : formatK(r.value)) : ''
        const pctStr  = grossSales && r.value !== null ? ((r.value / grossSales) * 100).toFixed(1) + '%' : ''
        const ind     = r.indent ? 'padding-left:28px;' : 'padding-left:12px;'
        const isDrill = !!r.cat
        const isOpen  = isDrill && plDrillCategory === r.cat

        let trStyle = '', td2Style = ''
        if (r.style === 'net') {
            trStyle  = 'background:#1a1a2e;color:#fff;font-weight:600;font-size:14px;'
            td2Style = neg ? 'color:#ff8a80;' : 'color:#69f0ae;'
        } else if (r.style === 'subtotal') {
            trStyle  = 'background:#f8f9fb;font-weight:600;border-top:0.5px solid #e0e0e0;'
            td2Style = neg ? 'color:#c0392b;' : ''
        } else {
            td2Style = neg ? 'color:#c0392b;' : ''
        }

        const drillCursor = isDrill ? 'cursor:pointer;' : ''
        const openBg      = isOpen  ? 'background:#f0f4ff;' : ''
        const arrow       = isDrill ? `<span style="font-size:10px;margin-left:5px;color:#aaa;">${isOpen ? '▼' : '▶'}</span>` : ''

        html += `<tr style="${trStyle}${drillCursor}${openBg}" ${isDrill ? `data-cat="${r.cat}" class="pl-drill-row"` : ''}>
            <td style="padding:9px 8px;${ind}">${r.label}${arrow}</td>
            <td style="padding:9px 8px;text-align:right;padding-right:16px;${td2Style}">${valStr}</td>
            <td style="padding:9px 8px;text-align:right;padding-right:16px;color:#999;font-size:12px;">${pctStr}</td>
        </tr>`

        if (isOpen && r.aggRows) {
            html += buildSubRows(r.aggRows, r.isRevenue, grossSales)
        }
    })

    document.getElementById('plTableBody').innerHTML = html

    document.querySelectorAll('.pl-drill-row').forEach(row => {
        row.addEventListener('click', () => {
            const cat = row.dataset.cat
            plDrillCategory = (plDrillCategory === cat) ? null : cat
            renderPL()
        })
    })

    renderPLChart(grossSales, costOfSales, totalOther, distCosts, adminCosts, finCost, netProfit)
}

// ═══════════════════════════════════════════════════════════
// P&L — ACCORDION SUB-ROWS
// ═══════════════════════════════════════════════════════════
function buildSubRows(rows, isRevenue, grossSales) {
    if (!rows || !rows.length) return '<tr><td colspan="3" style="padding:6px 24px;font-size:11px;color:#aaa;">No detail available</td></tr>'

    const itemMap = {}
    rows.forEach(row => {
        const key = row.account_name || row.account_no || 'Unknown'
        if (!itemMap[key]) itemMap[key] = 0
        itemMap[key] += row.balance
    })

    const items = Object.entries(itemMap)
        .map(([name, bal]) => [name, isRevenue ? -bal : bal])
        .filter(([, v]) => Math.abs(v) > 0.01)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

    if (!items.length) return '<tr><td colspan="3" style="padding:6px 24px;font-size:11px;color:#aaa;">No items</td></tr>'

    const total = items.reduce((s, [, v]) => s + Math.abs(v), 0)

    let html = `<tr style="background:#e8edf8;">
        <td colspan="3" style="padding:5px 12px 4px 32px;font-size:10px;font-weight:600;color:#7a8cba;text-transform:uppercase;letter-spacing:0.4px;">Detail</td>
    </tr>`

    items.forEach(([name, val]) => {
        const neg    = val < 0
        const valStr = neg ? '(' + formatK(Math.abs(val)) + ')' : formatK(val)
        const pct    = total ? ((Math.abs(val) / total) * 100).toFixed(1) + '%' : ''
        const barW   = total ? Math.round((Math.abs(val) / total) * 80) : 0

        html += `<tr style="background:#f4f7ff;border-bottom:0.5px solid #e8ecf8;">
            <td style="padding:7px 8px 7px 36px;">
                <div style="font-size:11px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;">${name}</div>
                <div style="background:#dde4f5;border-radius:2px;height:3px;margin-top:3px;width:100%;">
                    <div style="background:#4F81BD;border-radius:2px;height:3px;width:${barW}%;"></div>
                </div>
            </td>
            <td style="padding:7px 16px 7px 8px;text-align:right;font-size:12px;${neg ? 'color:#c0392b;' : 'color:#333;'}">${valStr}</td>
            <td style="padding:7px 16px 7px 8px;text-align:right;font-size:11px;color:#aaa;">${pct}</td>
        </tr>`
    })

    const subTotal = items.reduce((s, [, v]) => s + v, 0)
    const negSub   = subTotal < 0
    html += `<tr style="background:#dce3f5;font-weight:600;">
        <td style="padding:7px 8px 7px 36px;font-size:12px;color:#3a4f8c;">Subtotal</td>
        <td style="padding:7px 16px 7px 8px;text-align:right;font-size:12px;${negSub ? 'color:#c0392b;' : 'color:#1a1a2e;'}">${negSub ? '(' + formatK(Math.abs(subTotal)) + ')' : formatK(subTotal)}</td>
        <td style="padding:7px 16px 7px 8px;text-align:right;font-size:11px;color:#888;">${grossSales ? ((subTotal / grossSales) * 100).toFixed(1) + '%' : ''}</td>
    </tr>`

    return html
}

// ═══════════════════════════════════════════════════════════
// P&L — WATERFALL CHART
// ═══════════════════════════════════════════════════════════
function renderPLChart(revenue, cogs, otherInc, dist, admin, finance, net) {
    if (currentPLChart) currentPLChart.destroy()

    const grossProfit = revenue - cogs
    const opex        = dist + admin + finance
    const labels      = ['Revenue', 'Cost of Sales', 'Gross Profit', 'Other Income', 'OpEx', 'Net Profit']
    const bases       = [0, grossProfit, grossProfit, grossProfit + otherInc, grossProfit + otherInc - opex, 0]
    const vals        = [revenue, cogs, grossProfit, otherInc, opex, net]
    const baseColors  = ['#4F81BD', '#E8603C', '#27AE60', '#2ECC71', '#E8603C', net >= 0 ? '#27AE60' : '#E8603C']

    const catToIdx = {
        'Cost of Sales': 1, 'Other Income': 3, 'Gain on foreign exchange': 3,
        'Distribution Costs': 4, 'Administrative expenses': 4, 'Finance Cost': 4
    }
    const hi     = plDrillCategory ? catToIdx[plDrillCategory] : -1
    const colors = baseColors.map((c, i) => hi === -1 || i === hi ? c : c + '44')

    const ctx = document.getElementById('plChart').getContext('2d')
    currentPLChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'base', data: bases, backgroundColor: 'transparent', stack: 'wf' },
                { label: 'val',  data: vals.map(v => Math.abs(v)), backgroundColor: colors,
                  borderRadius: 3, stack: 'wf', categoryPercentage: 0.45, barPercentage: 0.85 }
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

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — FILTERS
// ═══════════════════════════════════════════════════════════
function populatePLCompareFilters() {
    const d = allPLData
    const companies = ['All', ...unique(d, 'company')]
    const years     = ['All', ...[...new Set(d.map(x => x.year).filter(Boolean))].sort()]
    const months    = ['All', ...monthOrder.filter(m => d.some(x => x.month === m))]

    setOpts('plCompCompany1', companies)
    setOpts('plCompYear1',    years)
    setOpts('plCompMonth1',   months)
    setOpts('plCompCompany2', companies)
    setOpts('plCompYear2',    years)
    setOpts('plCompMonth2',   months)

    ;['plCompCompany1','plCompYear1','plCompMonth1',
      'plCompCompany2','plCompYear2','plCompMonth2']
        .forEach(id => document.getElementById(id).addEventListener('change', renderPLComparison))

    document.getElementById('plCompResetBtn').addEventListener('click', () => {
        ;['plCompCompany1','plCompYear1','plCompMonth1',
          'plCompCompany2','plCompYear2','plCompMonth2']
            .forEach(id => document.getElementById(id).selectedIndex = 0)
        renderPLComparison()
    })
}

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — FILTERED DATA
// Returns aggregated numbers using actual DB field names
// ═══════════════════════════════════════════════════════════
function getPLCompAgg(side) {
    const g       = id => document.getElementById(id).value
    const company = g(`plCompCompany${side}`)
    const year    = g(`plCompYear${side}`)
    const month   = g(`plCompMonth${side}`)

    const rows = allPLData.filter(r => {
        if (company !== 'All' && r.company !== company)       return false
        if (year    !== 'All' && String(r.year) !== year)     return false
        if (month   !== 'All' && r.month !== month)           return false
        return true
    })

    const agg = {}
    rows.forEach(r => {
        if (!agg[r.sort]) agg[r.sort] = 0
        agg[r.sort] += r.balance
    })

    return {
        grossSales:  -(agg['Sales of Goods']           ?? 0),
        costOfSales:   agg['Cost of Sales']            ?? 0,
        otherIncome: -(agg['Other Income']             ?? 0),
        fxGain:      -(agg['Gain on foreign exchange'] ?? 0),
        distCosts:     agg['Distribution Costs']       ?? 0,
        adminCosts:    agg['Administrative expenses']  ?? 0,
        finCost:       agg['Finance Cost']             ?? 0,
        get grossProfit() { return this.grossSales - this.costOfSales },
        get totalOther()  { return this.otherIncome + this.fxGain },
        get totalOpEx()   { return this.distCosts + this.adminCosts + this.finCost },
        get netProfit()   { return this.grossProfit + this.totalOther - this.totalOpEx }
    }
}

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — MAIN RENDER
// ═══════════════════════════════════════════════════════════
function renderPLComparison() {
    const a = getPLCompAgg(1)
    const b = getPLCompAgg(2)

    // KPI cards
    document.getElementById('plCompRev1').textContent  = formatK(a.grossSales)
    document.getElementById('plCompRev2').textContent  = formatK(b.grossSales)

    const gpPctA = a.grossSales ? ((a.grossProfit / a.grossSales) * 100).toFixed(1) : '0.0'
    const gpPctB = b.grossSales ? ((b.grossProfit / b.grossSales) * 100).toFixed(1) : '0.0'
    document.getElementById('plCompGP1').textContent   = `${formatK(a.grossProfit)} (${gpPctA}%)`
    document.getElementById('plCompGP2').textContent   = `${formatK(b.grossProfit)} (${gpPctB}%)`

    const npPctA = a.grossSales ? ((a.netProfit / a.grossSales) * 100).toFixed(1) : '0.0'
    const npPctB = b.grossSales ? ((b.netProfit / b.grossSales) * 100).toFixed(1) : '0.0'
    document.getElementById('plCompNP1').textContent   = `${formatK(a.netProfit)} (${npPctA}%)`
    document.getElementById('plCompNP2').textContent   = `${formatK(b.netProfit)} (${npPctB}%)`

    // Comparison table
    const body = document.getElementById('plCompareTableBody')
    const lineItems = [
        { label: 'Gross Sales',              vA: a.grossSales,   vB: b.grossSales,   style: 'revenue'  },
        { label: 'Cost of Sales',            vA: -a.costOfSales, vB: -b.costOfSales, style: 'expense'  },
        { label: 'GROSS PROFIT',             vA: a.grossProfit,  vB: b.grossProfit,  style: 'subtotal' },
        { label: '',                         vA: null,           vB: null,           style: 'spacer'   },
        { label: 'Other Income',             vA: a.otherIncome,  vB: b.otherIncome,  style: 'revenue'  },
        { label: 'FX Gain / (Loss)',         vA: a.fxGain,       vB: b.fxGain,       style: 'revenue'  },
        { label: 'Total Other Income',       vA: a.totalOther,   vB: b.totalOther,   style: 'subtotal' },
        { label: '',                         vA: null,           vB: null,           style: 'spacer'   },
        { label: 'Distribution Costs',       vA: -a.distCosts,   vB: -b.distCosts,   style: 'expense'  },
        { label: 'Administrative Expenses',  vA: -a.adminCosts,  vB: -b.adminCosts,  style: 'expense'  },
        { label: 'Finance Cost',             vA: -a.finCost,     vB: -b.finCost,     style: 'expense'  },
        { label: 'Total Operating Expenses', vA: -a.totalOpEx,   vB: -b.totalOpEx,   style: 'subtotal' },
        { label: '',                         vA: null,           vB: null,           style: 'spacer'   },
        { label: 'NET PROFIT / (LOSS)',      vA: a.netProfit,    vB: b.netProfit,    style: 'net'      }
    ]

    body.innerHTML = lineItems.map(r => {
        if (r.style === 'spacer') return '<tr><td colspan="5" style="height:8px;"></td></tr>'

        const fmtV = v => {
            if (v === null) return ''
            return v < 0 ? `<span style="color:#c0392b;">(${formatK(Math.abs(v))})</span>` : formatK(v)
        }
        const pctOf = (v, base) => base ? ((v / base) * 100).toFixed(1) + '%' : '—'
        const variance = r.vA !== null && r.vB !== null ? r.vA - r.vB : null
        const varStr = variance === null ? '' :
            variance > 0
                ? `<span style="color:#27AE60;">+${formatK(variance)}</span>`
                : variance < 0
                    ? `<span style="color:#c0392b;">(${formatK(Math.abs(variance))})</span>`
                    : '—'

        let trStyle = ''
        if (r.style === 'net')      trStyle = 'background:#1a1a2e;color:#fff;font-weight:600;'
        else if (r.style === 'subtotal') trStyle = 'background:#f8f9fb;font-weight:600;border-top:0.5px solid #e0e0e0;'

        return `<tr style="${trStyle}">
            <td style="padding:8px 8px 8px 12px;">${r.label}</td>
            <td style="padding:8px 16px 8px 8px;text-align:right;">${fmtV(r.vA)}</td>
            <td style="padding:8px 16px 8px 8px;text-align:right;color:#999;font-size:12px;">${r.vA !== null ? pctOf(r.vA, a.grossSales) : ''}</td>
            <td style="padding:8px 16px 8px 8px;text-align:right;">${fmtV(r.vB)}</td>
            <td style="padding:8px 16px 8px 8px;text-align:right;color:#999;font-size:12px;">${r.vB !== null ? pctOf(r.vB, b.grossSales) : ''}</td>
            <td style="padding:8px 16px 8px 8px;text-align:right;">${varStr}</td>
        </tr>`
    }).join('')

    renderPLComparisonChart(a, b)
}

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — CHART
// ═══════════════════════════════════════════════════════════
function renderPLComparisonChart(a, b) {
    if (plCompChart) plCompChart.destroy()

    const labels   = ['Revenue', 'Gross Profit', 'OpEx', 'Net Profit']
    const valsA    = [a.grossSales, a.grossProfit, a.totalOpEx, a.netProfit]
    const valsB    = [b.grossSales, b.grossProfit, b.totalOpEx, b.netProfit]

    // Label datasets with the selected period labels
    const lbl1 = [
        document.getElementById('plCompCompany1').value,
        document.getElementById('plCompMonth1').value,
        document.getElementById('plCompYear1').value
    ].filter(v => v && v !== 'All').join(' ') || 'Period A'

    const lbl2 = [
        document.getElementById('plCompCompany2').value,
        document.getElementById('plCompMonth2').value,
        document.getElementById('plCompYear2').value
    ].filter(v => v && v !== 'All').join(' ') || 'Period B'

    const ctx = document.getElementById('plCompareChart').getContext('2d')
    plCompChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: lbl1,
                    data: valsA,
                    backgroundColor: '#4F81BDCC',
                    borderColor: '#4F81BD',
                    borderWidth: 1,
                    borderRadius: 4,
                    categoryPercentage: 0.5,
                    barPercentage: 0.85
                },
                {
                    label: lbl2,
                    data: valsB,
                    backgroundColor: '#C0504DCC',
                    borderColor: '#C0504D',
                    borderWidth: 1,
                    borderRadius: 4,
                    categoryPercentage: 0.5,
                    barPercentage: 0.85
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 24 } },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: item => ` ${item.dataset.label}: ${formatK(item.raw)}` } }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { color: '#666', font: { size: 11 } } },
                y: { grid: { display: false }, border: { display: false }, ticks: { display: false } }
            }
        },
        plugins: [{
            id: 'plCompValueLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart
                chart.data.datasets.forEach((ds, di) => {
                    chart.getDatasetMeta(di).data.forEach((bar, i) => {
                        ctx.save()
                        ctx.fillStyle = di === 0 ? '#4F81BD' : '#C0504D'
                        ctx.font = '10px Segoe UI, sans-serif'
                        ctx.textAlign = 'center'
                        ctx.fillText(formatK(ds.data[i]), bar.x, bar.y - 5)
                        ctx.restore()
                    })
                })
            }
        }]
    })
}

// ═══════════════════════════════════════════════════════════
// COLOR PICKER
// ═══════════════════════════════════════════════════════════
document.getElementById('colorPicker').addEventListener('input', e => {
    chartColor = e.target.value
    renderSalesChart()
})

init()
