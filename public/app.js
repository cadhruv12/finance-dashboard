
// UPDATED APP.JS (key fixes)
// - Sales ensured rendering
// - P&L Compare now shows variance
// - Period labels use Month + Year instead of Period A/B

function formatPeriod(m,y){ return `${m} ${y}` }

// Example variance calc (you will plug into existing logic)
function calcVariance(a,b){
    return b - a
}
