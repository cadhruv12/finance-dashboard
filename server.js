const express  = require('express')
const sqlite3  = require('sqlite3').verbose()
const csv      = require('csv-parser')
const chokidar = require('chokidar')
const fs       = require('fs')
const path     = require('path')

const app  = express()
const PORT = 3000

app.use(express.static('public'))

// ───────────────────────────────────────────────────────────
// DATABASE INITIALIZATION
// ───────────────────────────────────────────────────────────
const db = new sqlite3.Database('./finance.db')

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

// ───────────────────────────────────────────────────────────
// FILE LOAD TRACKING
// ───────────────────────────────────────────────────────────
function isLoaded(fp, cb) {
    db.get(`SELECT filepath FROM loaded_files WHERE filepath = ?`, [fp], (e, r) => cb(!!r))
}
function markLoaded(fp) {
    db.run(`INSERT OR IGNORE INTO loaded_files VALUES (?, ?)`, [fp, new Date().toISOString()])
}

// ───────────────────────────────────────────────────────────
// MONTH PARSING
// ───────────────────────────────────────────────────────────
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

// ───────────────────────────────────────────────────────────
// PROCESS SALES FILE
// ───────────────────────────────────────────────────────────
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

// ───────────────────────────────────────────────────────────
// PROCESS TB FILE
// ───────────────────────────────────────────────────────────
function processTBFile(filePath) {
    isLoaded(filePath, already => {
        if (already) { console
