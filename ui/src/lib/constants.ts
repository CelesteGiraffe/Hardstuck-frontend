// Link to the plugin's source repo (Hardstuck) and a placeholder plugin page on BakkesMod.
export const pluginSourceUrl = 'https://github.com/CelesteGiraffe/Hardstuck';
// Placeholder BakkesMod plugin page until the plugin is approved/hosted on the BakkesMod site.
export const pluginBakkesPage = 'https://bakkesmod.org/plugins/Hardstuck';

// Backwards compatible single-url export (keeps previous name) — points to the source by default.
export const pluginInstallUrl = pluginSourceUrl;

export function getBakkesUserId(): string {
	return import.meta.env.VITE_BAKKES_USER_ID ?? 'local-user';
}
