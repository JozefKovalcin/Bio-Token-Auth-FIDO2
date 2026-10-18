# Infraštruktúra

Súbor `compose.yaml` v koreňovom priečinku spúšťa PostgreSQL, aplikačné programovacie rozhranie (API, Application Programming Interface) v NestJS a Caddy. API aj databáza komunikujú v internej sieti kontajnerov. Hostiteľ sprístupňuje TCP porty 80 a 443. Caddy poskytuje zostavený web, presmeruje HTTP na HTTPS a smeruje cesty `/api/*` na API.

Direktíva `tls internal` v `Caddyfile` používa lokálnu certifikačnú autoritu. Každý klientsky počítač alebo telefón musí dôverovať jej verejnému koreňovému certifikátu. Docker volumes uchovávajú databázu a údaje certifikačnej autority aj po zastavení kontajnerov. Privátny kľúč CA zostáva v jej volume. Postup exportu certifikátu a nastavenia dôvery uvádza [návod na LAN test](../docs/lan-test.md).
