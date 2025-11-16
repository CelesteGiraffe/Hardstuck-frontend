export const pluginInstallUrl = 'https://github.com/CelesteGiraffe/RL-Trainer-2#3-bakkesmod-plugin-c';

export function getBakkesUserId(): string {
	return import.meta.env.VITE_BAKKES_USER_ID ?? 'local-user';
}
