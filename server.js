const express  = require('express')
const sqlite3  = require('sqlite3').verbose()
const csv      = require('csv-parser')
const chokidar = require('chokidar')
const fs       = require('fs')
const path     = require('path')

const app  = express()
const PORT = process.env.PORT || 3000

app.use(express.static('public'))

const dbPath = path.join(__dirname, 'finance.db');
const gzPath = path.join(__dirname, 'finance.db.gz');

// If finance.db does not exist but finance.db.gz does, decompress it
if (!fs.existsSync(dbPath) && fs.existsSync(gzPath)) {
    console.log("Decompressing finance.db.gz...");
    const zlib = require('zlib');
    const compressed = fs.readFileSync(gzPath);
    const decompressed = zlib.gunzipSync(compressed);
    fs.writeFileSync(dbPath, decompressed);
    console.log("Decompression complete.");
}

const db = new sqlite3.Database(dbPath);


db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS sales (
        company TEXT, division TEXT, month TEXT, year TEXT,
        customer TEXT, brand TEXT, salesman TEXT, net_sales REAL
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS tb (
        company TEXT, period TEXT, month TEXT, year TEXT,
        sort TEXT, account_no TEXT, account_name TEXT,
        opening REAL, debit REAL, credit REAL, balance REAL
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS loaded_files (
        filepath TEXT PRIMARY KEY, loaded_at TEXT
    )`)
})

function isLoaded(fp, cb) {
    db.get(`SELECT filepath FROM loaded_files WHERE filepath = ?`, [fp], (e, r) => cb(!!r))
}
function markLoaded(fp) {
    db.run(`INSERT OR IGNORE INTO loaded_files VALUES (?, ?)`, [fp, new Date().toISOString()])
}

const MONTH_MAP = {
    jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',may:'May',jun:'Jun',
    jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec',
    january:'Jan',february:'Feb',march:'Mar',april:'Apr',june:'Jun',
    july:'Jul',august:'Aug',september:'Sep',october:'Oct',november:'Nov',december:'Dec'
}

function parseMonthYear(str) {
    str = (str || '').trim()
    const m = str.match(/^([A-Za-z]+)(\d{2,4})$/)
    if (m) {
        const mo = MONTH_MAP[m[1].toLowerCase()]
        const yr = m[2].length === 2 ? '20' + m[2] : m[2]
        if (mo) return { month: mo, year: yr }
    }
    const m2 = str.match(/^(\d{4})-(\d{2})$/)
    if (m2) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        return { month: months[parseInt(m2[2]) - 1], year: m2[1] }
    }
    return { month: str, year: '' }
}

function parseTBFilename(filename) {
    const base  = path.basename(filename, path.extname(filename))
    const parts = base.split('_')
    const company = parts[0]
    let periodStr = ''
    for (let i = 1; i < parts.length; i++) {
        if (/^[A-Za-z]+\d+$/.test(parts[i])) { periodStr = parts[i]; break }
    }
    const { month, year } = parseMonthYear(periodStr)
    return { company, month, year, period: periodStr }
}

function processSalesFile(filePath, company) {
    isLoaded(filePath, already => {
        if (already) { console.log('Skip:', path.basename(filePath)); return }
        const rows = []
        fs.createReadStream(filePath).pipe(csv())
            .on('data', r => rows.push(r))
            .on('end', () => {
                db.serialize(() => {
                    db.run('BEGIN TRANSACTION')
                    const stmt = db.prepare(`INSERT INTO sales VALUES (?,?,?,?,?,?,?,?)`)
                    rows.forEach(r => stmt.run([
                        company, r['Division'] || '', r['Month'] || '', String(r['Year'] || ''),
                        r['Cust Name'] || '', r['Brand Name'] || '', r['Salesman Name'] || '',
                        parseFloat(r['Net Sales'] || r['Net'] || 0)
                    ]))
                    stmt.finalize()
                    db.run('COMMIT')
                })
                markLoaded(filePath)
                console.log('Loaded Sales:', path.basename(filePath), rows.length, 'rows')
            })
    })
}

function processTBFile(filePath) {
    isLoaded(filePath, already => {
        if (already) { console.log('Skip:', path.basename(filePath)); return }
        const { company, month, year, period } = parseTBFilename(filePath)
        const rows = []
        fs.createReadStream(filePath).pipe(csv())
            .on('data', r => rows.push(r))
            .on('end', () => {
                db.serialize(() => {
                    db.run('BEGIN TRANSACTION')
                    const stmt = db.prepare(`INSERT INTO tb VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
                    rows.forEach(r => {
                        const keys    = Object.keys(r)
                        const sortKey = keys.find(k => k.replace(/^\uFEFF/, '').trim().toUpperCase() === 'SORT') || keys[0]
                        const sort    = (r[sortKey] || '').trim()
                        if (!sort || sort === '-') return
                        stmt.run([
                            company, period, month, year, sort,
                            (r['ACCOUNT NO'] || '').trim(),
                            (r['ACCOUNT NAME'] || '').trim(),
                            parseFloat(r[' OPENING BALANCE '] || r['OPENING BALANCE'] || 0),
                            parseFloat(r[' DEBIT AMOUNT ']    || r['DEBIT AMOUNT']    || 0),
                            parseFloat(r[' CREDIT AMOUNT ']   || r['CREDIT AMOUNT']   || 0),
                            parseFloat(r[' BALANCE ']         || r['BALANCE']         || 0)
                        ])
                    })
                    stmt.finalize()
                    db.run('COMMIT')
                })
                markLoaded(filePath)
                console.log('Loaded TB:', path.basename(filePath), '->', company, month, year, rows.length, 'rows')
            })
    })
}

const dataPath = path.join(__dirname, 'data')
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath)

chokidar.watch(dataPath, { persistent: true, ignoreInitial: false })
    .on('add', filePath => {
        if (!filePath.endsWith('.csv')) return
        const rel   = path.relative(dataPath, filePath)
        const parts = rel.split(path.sep)
        if (parts.length < 3) return
        const folder = parts[1].toLowerCase()
        if      (folder === 'sales') processSalesFile(filePath, parts[0])
        else if (folder === 'tb')    processTBFile(filePath)
    })

app.get('/sales', (req, res) => {
    db.all(`SELECT * FROM sales`, [], (e, rows) => res.json(rows))
})

const PL_CATS = [
    'Sales of Goods','Cost of Sales','Gain on foreign exchange',
    'Other Income','Finance Cost','Distribution Costs','Administrative expenses'
]

app.get('/pl', (req, res) => {
    const ph = PL_CATS.map(() => '?').join(',')
    db.all(
        `SELECT sort, account_no, account_name, company, month, year,
                SUM(opening) as opening, SUM(debit) as debit,
                SUM(credit) as credit, SUM(balance) as balance
         FROM tb WHERE sort IN (${ph})
         GROUP BY sort, account_no, account_name, company, month, year
         ORDER BY account_no`,
        PL_CATS,
        (e, rows) => res.json(rows)
    )
})

app.listen(PORT, () => console.log(`\nFinance Dashboard → http://localhost:${PORT}\n`))
