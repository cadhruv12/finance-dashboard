// --- your entire existing server.js stays EXACTLY as-is above this line ---


// ═══════════════════════════════════════════════════════════
// HELPER: Convert "YYYY-MM" → { month: "Dec", year: "2024" }
// ═══════════════════════════════════════════════════════════
function parsePeriod(periodStr) {
    const [year, mm] = periodStr.split('-')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return { month: months[parseInt(mm) - 1], year }
}


// ═══════════════════════════════════════════════════════════
// HELPER: Get P&L for a single period
// Returns: { "Sales of Goods": 120000, "Cost of Sales": -60000, ... }
// ═══════════════════════════════════════════════════════════
function getPLForPeriod(month, year) {
    return new Promise((resolve, reject) => {
        const ph = PL_CATS.map(() => '?').join(',')
        db.all(
            `SELECT sort, SUM(balance) as balance
             FROM tb
             WHERE sort IN (${ph}) AND month = ? AND year = ?
             GROUP BY sort`,
            [...PL_CATS, month, year],
            (err, rows) => {
                if (err) return reject(err)
                const out = {}
                rows.forEach(r => out[r.sort] = r.balance)
                resolve(out)
            }
        )
    })
}


// ═══════════════════════════════════════════════════════════
// NEW ENDPOINT: Period A vs Period B Comparison
// URL: /pl-compare?periodA=2024-12&periodB=2024-09
// ═══════════════════════════════════════════════════════════
app.get('/pl-compare', async (req, res) => {
    try {
        const { periodA, periodB } = req.query
        if (!periodA || !periodB) {
            return res.status(400).json({ error: 'periodA and periodB are required' })
        }

        const pA = parsePeriod(periodA)
        const pB = parsePeriod(periodB)

        const plA = await getPLForPeriod(pA.month, pA.year)
        const plB = await getPLForPeriod(pB.month, pB.year)

        const accounts = new Set([...Object.keys(plA), ...Object.keys(plB)])
        const result = []

        accounts.forEach(acc => {
            const a = plA[acc] || 0
            const b = plB[acc] || 0
            const variance = a - b
            const percent = b !== 0 ? variance / b : null

            result.push({
                account: acc,
                periodA: a,
                periodB: b,
                variance,
                percent,
                existsInA: plA[acc] !== undefined,
                existsInB: plB[acc] !== undefined
            })
        })

        res.json({
            periodA,
            periodB,
            data: result
        })

    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Internal server error' })
    }
})
