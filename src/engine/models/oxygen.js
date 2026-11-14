// Metabolic power <-> oxygen, CO2 and heat. No rendering code.
// 20,100 J per litre O2 (energy equivalent), 1.43 g per litre O2 at STP, respiratory quotient 0.85.
export const J_PER_L_O2 = 20100, G_PER_L_O2 = 1.43, RQ = 0.85;

export const vo2FromWatts = (W) => 60 * W / J_PER_L_O2;     // L/min
export const wattsFromVo2 = (Lpm) => Lpm * J_PER_L_O2 / 60;  // W

// Suit load for `powerW` held over `timeS`.
export function oxygen(powerW, timeS) {
  const vo2Lpm = vo2FromWatts(powerW), o2L = vo2Lpm * timeS / 60;
  return { vo2Lpm, o2L, o2g: o2L * G_PER_L_O2, co2L: RQ * o2L, heatW: powerW }; // heat to reject ~ metabolic power
}
