import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { finishOidc } from "@/lib/portal";
import { t, te } from "@/lib/i18n";

const TOKEN_KEY = "portal-edit-token";
const SESSION_KEY = "portal-session";

type Search = {
	code: string;
	state: string;
	error: string;
	error_description: string;
};

export const Route = createFileRoute("/oidc/callback")({
	validateSearch: (raw: Record<string, unknown>): Search => ({
		code: typeof raw.code === "string" ? raw.code : "",
		state: typeof raw.state === "string" ? raw.state : "",
		error: typeof raw.error === "string" ? raw.error : "",
		error_description: typeof raw.error_description === "string" ? raw.error_description : "",
	}),
	component: OidcCallback,
});

function OidcCallback() {
	const search = Route.useSearch();
	const [err, setErr] = useState("");
	useEffect(() => {
		if (search.error) {
			setErr(search.error_description || search.error || t("oidcPage.denied"));
			return;
		}
		if (!search.code || !search.state) {
			setErr(t("oidcPage.incomplete"));
			return;
		}
		let live = true;
		finishOidc({ data: { code: search.code, state: search.state } })
			.then(async (res) => {
				if (!live) return;
				try {
					sessionStorage.setItem(SESSION_KEY, JSON.stringify(res.session));
					if (res.sessionHttpOnly) {
						await fetch("/__dockit/session", {
							method: "POST",
							headers: { "content-type": "application/json" },
							credentials: "include",
							body: JSON.stringify({ token: res.token }),
						});
						sessionStorage.removeItem(TOKEN_KEY);
					} else {
						sessionStorage.setItem(TOKEN_KEY, res.token);
					}
				} catch {
					// ignore
				}
				window.location.replace("/");
			})
			.catch((e) => {
				if (live) setErr(te(e));
			});
		return () => {
			live = false;
		};
	}, [search.code, search.state, search.error, search.error_description]);
	return (
		<main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
			<p className="text-sm text-muted">{err || t("oidcPage.progress")}</p>
			{err ? (
				<Link to="/" className="settings-link">
					{t("oidcPage.back")}
				</Link>
			) : null}
		</main>
	);
}
