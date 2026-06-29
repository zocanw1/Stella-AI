/**
 * File ini berfungsi untuk memberikan informasi waktu dan tanggal yang akurat kepada Stella.
 */
module.exports = {
    name: "get_time",
    description: "Mendapatkan waktu, tanggal, dan zona waktu saat ini secara akurat.",
    parameters: {
        type: "OBJECT",
        properties: {}
    },
    async execute() {
        const now = new Date();
        return {
            formatted: now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
            iso: now.toISOString(),
            day: now.toLocaleDateString('id-ID', { weekday: 'long' }),
            timezone: 'Asia/Jakarta'
        };
    }
};
