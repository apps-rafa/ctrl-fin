-- Quando um item de menu (forma de pagamento, categoria...) foi desativado
alter table public.menu_itens add column if not exists desativado_em timestamptz;
