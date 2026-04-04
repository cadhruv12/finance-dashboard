// ==========================================================
// STATE & UTILITIES
// Modern UI (Option 2 + C + F)
// ==========================================================

let allSalesData   = []
let allPLData      = []
let currentChart   = null
let brandChart     = null
let custChart      = null
let currentPLChart = null
let chartColor     = '#4F81BD'

let salesDrillLabel = null
let plDrillCategory = null

const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function formatK(v) {
    return (v / 1000).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + 'K'
}

function truncate(str, n) {
    return str && str.length > n ? str.slice(0, n) + '…' : str
}

function unique(data, key) {
    return [...new Set(data.map(d => d[key]).filter(Boolean))]
}

function setOpts(id, values) {
    const el = document.getElementById(id)
    if (el) {
        el.innerHTML = values
            .map(v => `<option value="${v}">${v}</option>`)
            .join('')
    }
}

// ==========================================================
// INIT
// ==========================================================
async function init() {
    try {
        const [sRes, pRes] = await Promise.all([fetch('/sales'), fetch('/pl')])
        allSalesData = await sRes.json()
        allPLData    = await pRes.json()

        setupTabs()
        populateSalesFilters()
        renderSalesChart()
        populatePLFilters()
        renderPL()
        setupPLComparison()
    } catch (e) {
        console.error('Init error:', e)
    }
}

// ==========================================================
// TABS
// ==========================================================
function setupTabs() {
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
}

// ==========================================================
// SALES — FILTERS
// ==========================================================
function populateSalesFilters() {
    const d = allSalesData
    setOpts('companyFilter',  ['All', ...unique(d, 'company')])
    setOpts('yearFilter',     ['All', ...[...new Set(d.map(x => String(x.year)).filter(Boolean))].sort()])
    setOpts('monthFilter',    ['All', ...monthOrder.filter(m => d.some(x => x.month === m))])
    setOpts('brandFilter',    ['All', ...unique(d, 'brand')])
    setOpts('customerFilter', ['All', ...unique(d, 'customer')])
    setOpts('salesmanFilter', ['All', ...unique(d, 'salesman')])
    setOpts('divisionFilter', ['All', ...unique(d, 'division')])

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

    const cp = document.getElementById('colorPicker')
    if (cp) {
        cp.addEventListener('input', e => {
            chartColor = e.target.value || '#4F81BD'
            renderSalesChart()
            renderPL()
        })
    }
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

// ==========================================================
// SALES — MAIN CHART
// ==========================================================
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

// ==========================================================
// SALES — DRILL PANELS
// ==========================================================
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
    if (currentChart) { currentChart.destroy(); currentChart = null }
}

// ==========================================================
// SALES — HOVER TOOLTIP
// ==========================================================
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

// ==========================================================
// P&L — FILTERS
// ==========================================================
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

// ==========================================================
// P&L — AGGREGATION
// ==========================================================
function aggregatePL(rows) {
    const agg  = {}
    rows.forEach(row => {
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

    return {
        grossSales,
        costOfSales,
        grossProfit,
        otherIncome,
        fxGain,
        totalOther,
        distCosts,
        adminCosts,
        finCost,
        totalOpEx,
        netProfit,
        agg
    }
}

// ==========================================================
// P&L — MAIN RENDER
// ==========================================================
function renderPL() {
    const rows = getPLFiltered()
    if (!rows.length) {
        document.getElementById('plTableBody').innerHTML = ''
        document.getElementById('plKpiRevenue').textContent = '0K'
        document.getElementById('plKpiGP').textContent      = '0K (0.0%)'
        document.getElementById('plKpiNP').textContent      = '0K (0.0%)'
        document.getElementById('plKpiOpex').textContent    = '0K'
        if (currentPLChart) currentPLChart.destroy()
        return
    }

    const pl = aggregatePL(rows)
    const revenue = pl.grossSales
    const gp      = pl.grossProfit
    const np      = pl.netProfit
    const opex    = pl.totalOpEx

    const gpPct = revenue ? (gp / revenue) * 100 : 0
    const npPct = revenue ? (np / revenue) * 100 : 0

    document.getElementById('plKpiRevenue').textContent = formatK(revenue)
    document.getElementById('plKpiGP').textContent      = `${formatK(gp)} (${gpPct.toFixed(1)}%)`
    document.getElementById('plKpiNP').textContent      = `${formatK(np)} (${npPct.toFixed(1)}%)`
    document.getElementById('plKpiOpex').textContent    = formatK(opex)

    renderPLTable(pl, revenue)
    renderPLChart(pl)
}

// ==========================================================
// P&L — TABLE
// ==========================================================
function renderPLTable(pl, revenue) {
    const body = document.getElementById('plTableBody')
    body.innerHTML = ''

    const rows = [
        { label: 'Gross Sales',              value: pl.grossSales },
        { label: 'Cost of Sales',            value: -pl.costOfSales },
        { label: 'GROSS PROFIT',             value: pl.grossProfit },
        { label: 'Other Income',             value: pl.otherIncome },
        { label: 'FX Gain / (Loss)',         value: pl.fxGain },
        { label: 'Total Other Income',       value: pl.totalOther },
        { label: 'Distribution Costs',       value: -pl.distCosts },
        { label: 'Administrative Expenses',  value: -pl.adminCosts },
        { label: 'Finance Cost',             value: -pl.finCost },
        { label: 'Total Operating Expenses', value: -pl.totalOpEx },
        { label: 'NET PROFIT / (LOSS)',      value: pl.netProfit }
    ]

    rows.forEach(r => {
        const tr = document.createElement('tr')
        const neg = r.value < 0
        const valStr = neg ? '(' + formatK(Math.abs(r.value)) + ')' : formatK(r.value)
        const pctStr = revenue ? ((r.value / revenue) * 100).toFixed(1) + '%' : '0.0%'

        tr.innerHTML = `
            <td>${r.label}</td>
            <td class="num" style="${neg ? 'color:#c0392b;' : ''}">${valStr}</td>
            <td class="num" style="color:#777;">${pctStr}</td>
        `
        body.appendChild(tr)
    })
}

// ==========================================================
// P&L — WATERFALL CHART
// ==========================================================
function renderPLChart(pl) {
    if (currentPLChart) currentPLChart.destroy()

    const labels = ['Revenue','Cost of Sales','Gross Profit','Other Income','FX Gain','Total Other','OpEx','Net Profit']
    const data   = [
        pl.grossSales,
        -pl.costOfSales,
        pl.grossProfit,
        pl.otherIncome,
        pl.fxGain,
        pl.totalOther,
        -pl.totalOpEx,
        pl.netProfit
    ]
    const colors = [
        '#4F81BD','#C0504D','#9BBB59','#4BACC6','#8064A2','#4BACC6','#F79646', pl.netProfit >= 0 ? '#9BBB59' : '#C0504D'
    ]

    const ctx = document.getElementById('plChart').getContext('2d')
    currentPLChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'P&L',
                data,
                backgroundColor: colors.map(c => c + 'CC'),
                borderColor: colors,
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

// ==========================================================
// P&L COMPARISON — SETUP
// ==========================================================
function setupPLComparison() {
    const inputA = document.getElementById('plCompPeriodA')
    const inputB = document.getElementById('plCompPeriodB')
    const btn   = document.getElementById('plCompApplyBtn')

    if (!inputA || !inputB || !btn) return

    btn.addEventListener('click', () => {
        const valA = inputA.value   // "2024-01"
        const valB = inputB.value
        if (!valA || !valB) return

        const [yearA, mA] = valA.split('-')
        const [yearB, mB] = valB.split('-')
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const monA = months[parseInt(mA, 10) - 1]
        const monB = months[parseInt(mB, 10) - 1]

        const rowsA = allPLData.filter(r => String(r.year) === yearA && r.month === monA)
        const rowsB = allPLData.filter(r => String(r.year) === yearB && r.month === monB)

        const plA = aggregatePL(rowsA)
        const plB = aggregatePL(rowsB)

        const labelA = `${monA} ${yearA}`
        const labelB = `${monB} ${yearB}`

        renderPLComparison(plA, plB, labelA, labelB)
    })
}

// ==========================================================
// P&L COMPARISON — RENDER
// ==========================================================
function renderPLComparison(plA, plB, labelA, labelB) {
    document.getElementById('plCompColA').textContent = labelA
    document.getElementById('plCompColB').textContent = labelB

    const rows = [
        { key: 'grossSales',  label: 'Gross Sales' },
        { key: 'costOfSales', label: 'Cost of Sales', invert: true },
        { key: 'grossProfit', label: 'Gross Profit' },
        { key: 'otherIncome', label: 'Other Income' },
        { key: 'fxGain',      label: 'FX Gain / (Loss)' },
        { key: 'totalOther',  label: 'Total Other Income' },
        { key: 'distCosts',   label: 'Distribution Costs', invert: true },
        { key: 'adminCosts',  label: 'Administrative Expenses', invert: true },
        { key: 'finCost',     label: 'Finance Cost', invert: true },
        { key: 'totalOpEx',   label: 'Total Operating Expenses', invert: true },
        { key: 'netProfit',   label: 'Net Profit / (Loss)' }
    ]

    const body = document.getElementById('plCompareTableBody')
    body.innerHTML = ''

    const getVal = (pl, key, invert) => {
        const v = pl[key] || 0
        return invert ? -v : v
    }

    const revA = plA.grossSales
    const revB = plB.grossSales
    const gpA  = plA.grossProfit
    const gpB  = plB.grossProfit
    const npA  = plA.netProfit
    const npB  = plB.netProfit
    const opA  = plA.totalOpEx
    const opB  = plB.totalOpEx

    rows.forEach(r => {
        const a = getVal(plA, r.key, r.invert)
        const b = getVal(plB, r.key, r.invert)
        const varVal = a - b
        const varPct = b !== 0 ? (varVal / b) * 100 : 0

        const negA = a < 0
        const negB = b < 0
        const negV = varVal < 0

        const tr = document.createElement('tr')
        tr.innerHTML = `
            <td>${r.label}</td>
            <td class="num" style="${negA ? 'color:#c0392b;' : ''}">${negA ? '(' + formatK(Math.abs(a)) + ')' : formatK(a)}</td>
            <td class="num" style="${negB ? 'color:#c0392b;' : ''}">${negB ? '(' + formatK(Math.abs(b)) + ')' : formatK(b)}</td>
            <td class="num" style="${negV ? 'color:#c0392b;' : 'color:#2e7d32;'}">${negV ? '(' + formatK(Math.abs(varVal)) + ')' : formatK(varVal)}</td>
            <td class="num" style="color:#777;">${varPct.toFixed(1)}%</td>
        `
        body.appendChild(tr)
    })

    const setKpi = (idVar, idSub, a, b, label) => {
        const v = a - b
        const pct = b !== 0 ? (v / b) * 100 : 0
        const neg = v < 0
        const elVar = document.getElementById(idVar)
        const elSub = document.getElementById(idSub)
        if (!elVar || !elSub) return
        elVar.textContent = neg ? '(' + formatK(Math.abs(v)) + ')' : formatK(v)
        elVar.style.color = neg ? '#c0392b' : '#2e7d32'
        elSub.textContent = `${labelA}: ${formatK(a)} · ${labelB}: ${formatK(b)} · ${pct.toFixed(1)}%`
    }

    setKpi('plCompRevVar',  'plCompRevSub',  revA, revB,  'Revenue')
    setKpi('plCompGPVar',   'plCompGPSub',   gpA,  gpB,   'Gross Profit')
    setKpi('plCompNPVar',   'plCompNPSub',   npA,  npB,   'Net Profit')
    setKpi('plCompOpexVar', 'plCompOpexSub', opA,  opB,   'Operating Expenses')