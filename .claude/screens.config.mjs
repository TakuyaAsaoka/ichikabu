// 管理画面の画面一覧を撮る設定（capturing-screens-to-canvas スキル。Issue #156）
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// パスワードは書き写さず、seed と同じ server/.env.local から読む
const env = parseEnv(
	readFileSync(new URL("../server/.env.local", import.meta.url), "utf8"),
);
const [admin] = JSON.parse(env.SEED_USERS);

async function signIn(page, { email, password }) {
	await page.goto("/signin");
	await page.getByLabel("メールアドレス").fill(email);
	await page.getByLabel("パスワード").fill(password);
	await page.getByRole("button", { name: "サインイン", exact: true }).click();
	await page.waitForURL((url) => url.pathname === "/");
}

// 一覧のリンクから開き、行き先の形を確かめる
function openFrom(listPath, link, urlPattern) {
	return async (page) => {
		await page.goto(listPath);
		await link(page).first().click();
		await page.waitForURL(urlPattern);
	};
}

export default {
	title: "イチカブ管理 画面一覧",
	favicon: "🗂️",
	artifactUrl: "https://claude.ai/artifact/76cAFhmeYoPGx6gHAXuZnk",
	baseURL: "http://localhost:3777",
	// BETTER_AUTH_URL を撮るポートに合わせないと、サインインの送信元が違うと断られる
	start:
		"cd server && pnpm gen && pnpm build && BETTER_AUTH_URL=http://localhost:3777 pnpm exec next start --port 3777",
	groups: [
		{
			title: "サインイン前",
			screens: [
				{ title: "サインイン", path: "/signin" },
				{
					title: "サインイン（許可していない Google アカウント）",
					path: "/signin?error=signup_disabled",
				},
			],
		},
		{
			// 開発用の SEED_USERS は管理者1人だけのため、入力者の段は無い
			title: "管理者",
			login: (page) => signIn(page, admin),
			screens: [
				{ title: "銘柄とテーマ", path: "/" },
				{
					title: "銘柄の編集",
					open: openFrom(
						"/",
						(page) => page.locator('a[href^="/stocks/"]'),
						/\/stocks\/\d+$/,
					),
				},
				{
					title: "テーマの編集",
					open: openFrom(
						"/",
						(page) => page.locator('a[href^="/themes/"]:not([href*="/stocks/"])'),
						/\/themes\/\d+$/,
					),
				},
				{
					title: "テーマ所属を外す",
					open: openFrom(
						"/",
						(page) => page.getByRole("link", { name: "外す" }),
						/\/themes\/\d+\/stocks\/\d+$/,
					),
				},
				{ title: "イベント", path: "/events" },
				{
					title: "イベントの編集",
					open: openFrom(
						"/events",
						(page) => page.locator('a[href^="/events/"]'),
						/\/events\/\d+$/,
					),
				},
				{ title: "貢献度", path: "/contributions" },
				{ title: "状態", path: "/status" },
				{ title: "監査ログ", path: "/audit" },
				{ title: "見つからない銘柄", path: "/stocks/999999", status: 404 },
			],
		},
	],
};
