// サイトの各ページの<head>に入れる Google アナリティクス4（GA4）のタグ。
// GA_MEASUREMENT_ID（GitHub Secrets）が空のときは何も出さない（空文字列を返す）。
// render-site.mjs（話題ごとのサイト）と render-topics-index.mjs（サイトのトップ docs/index.html）で共通に使う。
export function gaSnippet(measurementId = process.env.GA_MEASUREMENT_ID || "") {
  if (!measurementId) return "";
  return `
<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${measurementId}');
</script>`;
}
