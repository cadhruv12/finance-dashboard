===== START OF dashboard-app.js — CHUNK 1/6 =====

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let allSalesData   = []
let allPLData      = []
let currentChart   = null   // main sales chart
let brandChart     = null   // drill: top-10 brands chart
let custChart      = null   // drill: top-10 customers chart
let currentPLChart = null
let chartColor     = '#4F81BD'

let salesDrillLabel = null  // null = overview; "Jan 2024" = drilled period
let plDrillCategory = null  // null = overview; category string = open accordion row

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
    populatePLCompareFilters()   // ← added in Part 2
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

===== END OF CHUNK 1/6 =====
===== START OF dashboard-app.js — CHUNK 2/6 =====

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

===== END OF CHUNK 2/6 =====

===== START OF dashboard-app.js — CHUNK 3/6 =====

// ═══════════════════════════════════════════════════════════
// P&L — FILTERS
// ═══════════════════════════════════════════════════════════
function populatePLFilters() {
    const d = allPLData

    setOpts('plCompanyFilter', ['All', ...unique(d, 'company')])
    setOpts('plYearFilter',    ['All', ...unique(d, 'year').sort()])
    setOpts('plMonthFilter',   ['All', ...monthOrder.filter(m => d.some(x => x.month === m))])

    document.getElementById('plCompanyFilter').addEventListener('change', renderPL)
    document.getElementById('plYearFilter').addEventListener('change', renderPL)
    document.getElementById('plMonthFilter').addEventListener('change', renderPL)

    document.getElementById('plResetBtn').addEventListener('click', () => {
        ['plCompanyFilter','plYearFilter','plMonthFilter'].forEach(id => {
            document.getElementById(id).selectedIndex = 0
        })
        plDrillCategory = null
        renderPL()
    })
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
// ═══════════════════════════════════════════════════════════
function renderPL() {
    const rows = getPLFiltered()
    if (!rows.length) {
        document.getElementById('plTableBody').innerHTML = ''
        document.getElementById('plKpiRevenue').textContent = '0K'
        document.getElementById('plKpiGP').textContent      = '0K (0%)'
        document.getElementById('plKpiNP').textContent      = '0K (0%)'
        document.getElementById('plKpiOpex').textContent    = '0K'
        if (currentPLChart) currentPLChart.destroy()
        return
    }

    const revenue = rows.filter(r => r.category === 'Revenue')
                        .reduce((s, r) => s + r.amount, 0)

    const cogs = rows.filter(r => r.category === 'COGS')
                     .reduce((s, r) => s + r.amount, 0)

    const gp = revenue - cogs
    const gpPct = revenue ? (gp / revenue) * 100 : 0

    const opex = rows.filter(r => r.category === 'OPEX')
                     .reduce((s, r) => s + r.amount, 0)

    const np = gp - opex
    const npPct = revenue ? (np / revenue) * 100 : 0

    document.getElementById('plKpiRevenue').textContent = formatK(revenue)
    document.getElementById('plKpiGP').textContent      = `${formatK(gp)} (${gpPct.toFixed(1)}%)`
    document.getElementById('plKpiNP').textContent      = `${formatK(np)} (${npPct.toFixed(1)}%)`
    document.getElementById('plKpiOpex').textContent    = formatK(opex)

    renderPLTable(rows, revenue)
    renderPLChart(rows)
}

// ═══════════════════════════════════════════════════════════
// P&L — TABLE + ACCORDION
// ═══════════════════════════════════════════════════════════
function renderPLTable(rows, revenue) {
    const body = document.getElementById('plTableBody')
    body.innerHTML = ''

    const groups = {}
    rows.forEach(r => {
        if (!groups[r.category]) groups[r.category] = []
        groups[r.category].push(r)
    })

    Object.keys(groups).forEach(cat => {
        const catRows = groups[cat]
        const total = catRows.reduce((s, r) => s + r.amount, 0)
        const pct = revenue ? (total / revenue) * 100 : 0

        const isOpen = plDrillCategory === cat

        const tr = document.createElement('tr')
        tr.className = 'pl-cat-row'
        tr.innerHTML = `
            <td style="padding:6px 8px;font-weight:600;cursor:pointer;">
                ${isOpen ? '▼' : '▶'} ${cat}
            </td>
            <td style="padding:6px 8px;text-align:right;padding-right:16px;font-weight:600;">
                ${formatK(total)}
            </td>
            <td style="padding:6px 8px;text-align:right;padding-right:16px;font-weight:600;">
                ${pct.toFixed(1)}%
            </td>
        `
        tr.addEventListener('click', () => {
            plDrillCategory = isOpen ? null : cat
            renderPL()
        })
        body.appendChild(tr)

        if (isOpen) {
            catRows.forEach(r => {
                const sub = document.createElement('tr')
                sub.className = 'pl-sub-row'
                sub.innerHTML = `
                    <td style="padding:6px 8px 6px 24px;color:#555;">${r.subcategory}</td>
                    <td style="padding:6px 8px;text-align:right;padding-right:16px;color:#555;">${formatK(r.amount)}</td>
                    <td style="padding:6px 8px;text-align:right;padding-right:16px;color:#555;">
                        ${revenue ? ((r.amount / revenue) * 100).toFixed(1) : 0}%
                    </td>
                `
                body.appendChild(sub)
            })
        }
    })
}

===== END OF CHUNK 3/6 =====

===== START OF dashboard-app.js — CHUNK 4/6 =====

// ═══════════════════════════════════════════════════════════
// P&L — WATERFALL CHART
// ═══════════════════════════════════════════════════════════
function renderPLChart(rows) {
    if (currentPLChart) currentPLChart.destroy()

    const revenue = rows.filter(r => r.category === 'Revenue')
                        .reduce((s, r) => s + r.amount, 0)

    const cogs = rows.filter(r => r.category === 'COGS')
                     .reduce((s, r) => s + r.amount, 0)

    const gp = revenue - cogs

    const opex = rows.filter(r => r.category === 'OPEX')
                     .reduce((s, r) => s + r.amount, 0)

    const np = gp - opex

    const wf = [
        { label: 'Revenue', value: revenue, color: '#4F81BD' },
        { label: 'COGS',    value: -cogs,  color: '#C0504D' },
        { label: 'Gross Profit', value: gp, color: '#9BBB59' },
        { label: 'OPEX',    value: -opex,  color: '#F79646' },
        { label: 'Net Profit', value: np,  color: '#4BACC6' }
    ]

    let running = 0
    const labels = []
    const data = []
    const bg = []
    const br = []

    wf.forEach(step => {
        labels.push(step.label)
        data.push(step.value)
        bg.push(step.color + 'CC')
        br.push(step.color)
        running += step.value
    })

    const ctx = document.getElementById('plChart').getContext('2d')

    currentPLChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'P&L Waterfall',
                data,
                backgroundColor: bg,
                borderColor: br,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
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
                x: {
                    grid: { display: false },
                    ticks: { color: '#666', font: { size: 11 } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#666', font: { size: 11 } }
                }
            }
        },
        plugins: [{
            id: 'plValueLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart
                chart.getDatasetMeta(0).data.forEach((bar, i) => {
                    ctx.save()
                    ctx.fillStyle = '#444'
                    ctx.font = '11px Segoe UI, sans-serif'
                    ctx.textAlign = 'center'
                    ctx.fillText(formatK(data[i]), bar.x, bar.y - 6)
                    ctx.restore()
                })
            }
        }]
    })
}

// ═══════════════════════════════════════════════════════════
// COLOR PICKER — UPDATE ALL CHARTS
// ═══════════════════════════════════════════════════════════
document.getElementById('colorPicker').addEventListener('input', e => {
    chartColor = e.target.value
    renderSalesChart()
    renderPL()
})

===== END OF CHUNK 4/6 =====
===== START OF dashboard-app.js — CHUNK 5/6 =====

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — FILTERS
// ═══════════════════════════════════════════════════════════
function populatePLCompareFilters() {
    const d = allPLData

    const companies = ['All', ...unique(d, 'company')]
    const years     = ['All', ...unique(d, 'year').sort()]
    const months    = ['All', ...monthOrder.filter(m => d.some(x => x.month === m))]

    // LEFT SIDE
    setOpts('plCompCompany1', companies)
    setOpts('plCompYear1',    years)
    setOpts('plCompMonth1',   months)

    // RIGHT SIDE
    setOpts('plCompCompany2', companies)
    setOpts('plCompYear2',    years)
    setOpts('plCompMonth2',   months)

    // Event listeners
    ['plCompCompany1','plCompYear1','plCompMonth1',
     'plCompCompany2','plCompYear2','plCompMonth2']
        .forEach(id => document.getElementById(id).addEventListener('change', renderPLComparison))

    document.getElementById('plCompResetBtn').addEventListener('click', () => {
        ['plCompCompany1','plCompYear1','plCompMonth1',
         'plCompCompany2','plCompYear2','plCompMonth2']
            .forEach(id => document.getElementById(id).selectedIndex = 0)

        renderPLComparison()
    })
}

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — FILTERED DATA
// ═══════════════════════════════════════════════════════════
function getPLCompFiltered(side) {
    const g = id => document.getElementById(id).value

    const company = g(`plCompCompany${side}`)
    const year    = g(`plCompYear${side}`)
    const month   = g(`plCompMonth${side}`)

    return allPLData.filter(r => {
        if (company !== 'All' && r.company !== company) return false
        if (year    !== 'All' && String(r.year) !== year) return false
        if (month   !== 'All' && r.month !== month) return false
        return true
    })
}

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — MAIN RENDER
// ═══════════════════════════════════════════════════════════
function renderPLComparison() {
    const left  = getPLCompFiltered(1)
    const right = getPLCompFiltered(2)

    renderPLComparisonTable(left, right)
    renderPLComparisonKPIs(left, right)     // in chunk 6
    renderPLComparisonChart(left, right)    // in chunk 6
}

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — TABLE
// ═══════════════════════════════════════════════════════════
function renderPLComparisonTable(left, right) {
    const body = document.getElementById('plCompareTableBody')
    body.innerHTML = ''

    const categories = ['Revenue','COGS','OPEX']

    const sum = (rows, cat) =>
        rows.filter(r => r.category === cat).reduce((s, r) => s + r.amount, 0)

    const rev1 = sum(left, 'Revenue')
    const rev2 = sum(right, 'Revenue')

    categories.forEach(cat => {
        const v1 = sum(left, cat)
        const v2 = sum(right, cat)

        const pct1 = rev1 ? (v1 / rev1) * 100 : 0
        const pct2 = rev2 ? (v2 / rev2) * 100 : 0

        const tr = document.createElement('tr')
        tr.innerHTML = `
            <td style="padding:6px 8px;font-weight:600;">${cat}</td>

            <td style="padding:6px 8px;text-align:right;padding-right:16px;">
                ${formatK(v1)}
            </td>
            <td style="padding:6px 8px;text-align:right;padding-right:16px;">
                ${pct1.toFixed(1)}%
            </td>

            <td style="padding:6px 8px;text-align:right;padding-right:16px;">
                ${formatK(v2)}
            </td>
            <td style="padding:6px 8px;text-align:right;padding-right:16px;">
                ${pct2.toFixed(1)}%
            </td>
        `
        body.appendChild(tr)
    })
}

===== END OF CHUNK 5/6 =====
===== START OF dashboard-app.js — CHUNK 6/6 =====

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — KPIs
// ═══════════════════════════════════════════════════════════
function renderPLComparisonKPIs(left, right) {
    const sum = (rows, cat) =>
        rows.filter(r => r.category === cat).reduce((s, r) => s + r.amount, 0)

    const rev1 = sum(left, 'Revenue')
    const rev2 = sum(right, 'Revenue')

    const cogs1 = sum(left, 'COGS')
    const cogs2 = sum(right, 'COGS')

    const gp1 = rev1 - cogs1
    const gp2 = rev2 - cogs2

    const opex1 = sum(left, 'OPEX')
    const opex2 = sum(right, 'OPEX')

    const np1 = gp1 - opex1
    const np2 = gp2 - opex2

    const gpPct1 = rev1 ? (gp1 / rev1) * 100 : 0
    const gpPct2 = rev2 ? (gp2 / rev2) * 100 : 0

    const npPct1 = rev1 ? (np1 / rev1) * 100 : 0
    const npPct2 = rev2 ? (np2 / rev2) * 100 : 0

    document.getElementById('plCompRev1').textContent = formatK(rev1)
    document.getElementById('plCompRev2').textContent = formatK(rev2)

    document.getElementById('plCompGP1').textContent = `${formatK(gp1)} (${gpPct1.toFixed(1)}%)`
    document.getElementById('plCompGP2').textContent = `${formatK(gp2)} (${gpPct2.toFixed(1)}%)`

    document.getElementById('plCompNP1').textContent = `${formatK(np1)} (${npPct1.toFixed(1)}%)`
    document.getElementById('plCompNP2').textContent = `${formatK(np2)} (${npPct2.toFixed(1)}%)`
}

// ═══════════════════════════════════════════════════════════
// P&L COMPARISON — CHART
// ═══════════════════════════════════════════════════════════
let plCompChart = null

function renderPLComparisonChart(left, right) {
    if (plCompChart) plCompChart.destroy()

    const sum = (rows, cat) =>
        rows.filter(r => r.category === cat).reduce((s, r) => s + r.amount, 0)

    const rev1 = sum(left, 'Revenue')
    const rev2 = sum(right, 'Revenue')

    const cogs1 = sum(left, 'COGS')
    const cogs2 = sum(right, 'COGS')

    const gp1 = rev1 - cogs1
    const gp2 = rev2 - cogs2

    const opex1 = sum(left, 'OPEX')
    const opex2 = sum(right, 'OPEX')

    const np1 = gp1 - opex1
    const np2 = gp2 - opex2

    const labels = ['Revenue', 'COGS', 'Gross Profit', 'OPEX', 'Net Profit']
    const leftVals  = [rev1, -cogs1, gp1, -opex1, np1]
    const rightVals = [rev2, -cogs2, gp2, -opex2, np2]

    const ctx = document.getElementById('plCompareChart').getContext('2d')

    plCompChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Left',
                    data: leftVals,
                    backgroundColor: '#4F81BDCC',
                    borderColor: '#4F81BD',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Right',
                    data: rightVals,
                    backgroundColor: '#C0504DCC',
                    borderColor: '#C0504D',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: item => ' ' + formatK(item.raw)
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#666', font: { size: 11 } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#666', font: { size: 11 } }
                }
            }
        },
        plugins: [{
            id: 'plCompValueLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart
                chart.data.datasets.forEach((ds, di) => {
                    chart.getDatasetMeta(di).data.forEach((bar, i) => {
                        ctx.save()
                        ctx.fillStyle = '#444'
                        ctx.font = '10px Segoe UI, sans-serif'
                        ctx.textAlign = 'center'
                        ctx.fillText(formatK(ds.data[i]), bar.x, bar.y - 6)
                        ctx.restore()
                    })
                })
            }
        }]
    })
}

// ═══════════════════════════════════════════════════════════
// END OF FILE
// ═══════════════════════════════════════════════════════════

===== END OF CHUNK 6/6 =====

