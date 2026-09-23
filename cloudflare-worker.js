// ════════════════════════════════════════════════════════
//  Cloudflare Worker: oreonsolucoes.dpdns.org/cronograma  ->  GitHub Pages
//  Rota do Worker: oreonsolucoes.dpdns.org/cronograma*
//  O restante do domínio (túneis Zero Trust) não passa por aqui.
// ════════════════════════════════════════════════════════
const ORIGIN = 'https://oreonsolucoes.github.io/cronograma-obras'; // site no GitHub Pages
const PREFIX = '/cronograma';                                        // caminho no seu domínio

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // /cronograma -> /cronograma/ (necessário para os arquivos .css/.js relativos)
    if (url.pathname === PREFIX) {
      return Response.redirect(url.origin + PREFIX + '/' + url.search, 301);
    }
    if (!url.pathname.startsWith(PREFIX + '/')) {
      return new Response('Não encontrado', { status: 404 });
    }

    const path = url.pathname.slice(PREFIX.length) || '/';
    const upstream = await fetch(ORIGIN + path + url.search, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: { 'User-Agent': request.headers.get('User-Agent') || 'cf-worker' },
      redirect: 'manual',
      cf: { cacheTtl: 120, cacheEverything: true },
    });

    const headers = new Headers(upstream.headers);
    const loc = headers.get('Location');
    if (loc) headers.set('Location', loc.replace(ORIGIN, url.origin + PREFIX).replace('http://oreonsolucoes.github.io/cronograma-obras', url.origin + PREFIX));
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
