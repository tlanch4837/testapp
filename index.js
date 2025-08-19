// Node entry point that re-exports the pure pricing helpers without
// executing any browser-specific initialization.
const {
  baseRatePer1k,
  ageFactor,
  smokerFactor,
  productFactor,
  conditionsMultiplier,
  riderCost,
  computePremium,
  solveDeathBenefit
} = require('./app.js');

module.exports = {
  baseRatePer1k,
  ageFactor,
  smokerFactor,
  productFactor,
  conditionsMultiplier,
  riderCost,
  computePremium,
  solveDeathBenefit
};
