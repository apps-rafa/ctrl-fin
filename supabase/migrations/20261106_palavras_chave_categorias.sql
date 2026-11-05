-- Palavras-chave por categoria: o que o bot (texto) e a importação do banco usam para sugerir a categoria.
-- Antes ficavam fixas no código (listas por categoria nas edge functions); agora são do usuário e editáveis em Configurações > Categorias.
-- null = nunca definido; array (mesmo vazio) = lista do usuário. Os padrões abaixo valem só para quem ainda não tem lista.
-- A mesma lista está em js/menus-api.js (PALAVRAS_CHAVE_PADRAO), usada para novos usuários; tests/palavras-chave.test.mjs confere as duas.
alter table public.menu_itens add column if not exists palavras_chave text[];

update public.menu_itens set palavras_chave = array['drogaria', 'farmácia', 'droga raia', 'drogaraia', 'pacheco', 'pague menos', 'paguemenos', 'remédio', 'hospital', 'clínica', 'laboratório', 'dentista', 'odont', 'médico', 'consulta', 'academia', 'smart fit', 'smartfit', 'bodytech', 'bio ritmo', 'bioritmo'] where tipo = 'Categoria' and nome = 'Saúde' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['supermercado', 'hortifruti', 'atacadão', 'carrefour', 'extra', 'pão de açúcar', 'assaí', 'mercado', 'feira'] where tipo = 'Categoria' and nome = 'Mercado' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['restaurante', 'lanchonete', 'padaria', 'pizzaria', 'churrascaria', 'almoço', 'janta', 'comida', 'ifood', 'rappi', 'mcdonalds', 'burger king', 'habib', 'subway'] where tipo = 'Categoria' and nome = 'Alimentação' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['uber', '99app', '99pop'] where tipo = 'Categoria' and nome = 'Transporte app' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['táxi', 'ônibus', 'metrô', 'posto', 'ipiranga', 'shell', 'petrobras', 'ale combust', 'gasolina', 'estacionamento', 'zona azul'] where tipo = 'Categoria' and nome = 'Transporte' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['netflix', 'spotify', 'disney', 'amazon prime', 'hbo', 'paramount', 'assinatura'] where tipo = 'Categoria' and nome = 'Assinaturas' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['cinema', 'cinemark', 'teatro', 'show', 'festa', 'balada'] where tipo = 'Categoria' and nome = 'Lazer' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['escola', 'faculdade', 'universidade', 'udemy', 'alura', 'curso'] where tipo = 'Categoria' and nome = 'Educação' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['condomínio', 'imobiliária', 'aluguel', 'luz', 'água', 'gás', 'internet', 'cemig', 'light sa', 'enel', 'sabesp', 'copasa', 'eletropaulo'] where tipo = 'Categoria' and nome = 'Casa' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['salário'] where tipo = 'Categoria' and nome = 'Salário' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['vendi', 'vendeu', 'vendemos', 'venderam', 'vender', 'venda', 'revend'] where tipo = 'Categoria' and nome = 'Venda' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['bônus', 'premiação'] where tipo = 'Categoria' and nome = 'Bônus' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['freela'] where tipo = 'Categoria' and nome = 'Freelance' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['racha', 'dividi'] where tipo = 'Categoria' and nome = 'Racha' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['estorn'] where tipo = 'Categoria' and nome = 'Estorno' and palavras_chave is null;
update public.menu_itens set palavras_chave = array['reembols'] where tipo = 'Categoria' and nome = 'Reembolso' and palavras_chave is null;
