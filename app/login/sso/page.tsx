// KKU SSONext's registered login callback (config.SSORedirect). It is the
// same component as /login on purpose: the confirm card and, when the
// account has 2FA on, the code form are states of that page, and the
// comments there explain why the whole login must stay under /login
// (SessionActivityGuard / demo-prefix reasons). The page reads ?code= from
// the URL itself.
export { default } from "../page";
