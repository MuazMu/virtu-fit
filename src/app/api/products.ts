export async function GET() {
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!token || !domain) {
    return new Response(JSON.stringify({ error: 'Missing Shopify credentials' }), { status: 500 });
  }
  try {
    const res = await fetch(`https://${domain}/api/2023-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Storefront-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `{
          products(first: 12) {
            edges {
              node {
                id
                title
                images(first: 1) { edges { node { url } } }
                priceRange { minVariantPrice { amount currencyCode } }
              }
            }
          }
        }`,
      }),
    });
    if (!res.ok) {
      const error = await res.text();
      return new Response(JSON.stringify({ error }), { status: res.status });
    }
    const data = await res.json();
    type ShopifyEdge = { node: { id: string; title: string; images: { edges: { node: { url: string } }[] }; priceRange: { minVariantPrice: { amount: string; currencyCode: string } } } };
    const products = (data.data.products.edges as ShopifyEdge[]).map((edge) => {
      const node = edge.node;
      return {
        id: node.id,
        title: node.title,
        image: node.images.edges[0]?.node.url,
        price: `${node.priceRange.minVariantPrice.amount} ${node.priceRange.minVariantPrice.currencyCode}`,
      };
    });
    return new Response(JSON.stringify({ products }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to fetch products from Shopify' }), { status: 500 });
  }
} 