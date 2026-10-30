/**
 * GGE — avaliações aparecem na página, mas o site não manda nota para o Google.
 *
 * Decisão do Neco em 30/10/2026: as avaliações importadas do Mercado Livre são
 * publicadas inteiras, inclusive as negativas, mas sem aggregateRating — ou seja,
 * o Google não exibe estrelas no resultado de busca do produto.
 *
 * Os nós "review" individuais ficam, porque é o que as IAs leem para entender o
 * que os clientes dizem do produto. Sozinhos eles não geram a estrela na busca:
 * quem gera é o aggregateRating, que é justamente o que sai daqui.
 */
add_filter( 'rank_math/snippet/rich_snippet_product_entity', function ( $entity ) {
	unset( $entity['aggregateRating'] );
	return $entity;
}, 99 );
