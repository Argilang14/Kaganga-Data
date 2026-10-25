export function calculateSumatifRts(
	lingkup: number | null,
	sts: number | null,
	weights: { lingkup?: number | null; sts?: number | null } = {}
): number | null {
	let total = 0;
	let weight = 0;
	for (const [value, componentWeight] of [
		[lingkup, weights.lingkup ?? 70],
		[sts, weights.sts ?? 30]
	]) {
		if (value != null && componentWeight != null) {
			total += value * componentWeight;
			weight += componentWeight;
		}
	}
	return weight > 0 ? Math.round((total / weight) * 100) / 100 : null;
}
