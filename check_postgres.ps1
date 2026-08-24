# PowerShell script to verify PostgreSQL via Docker
docker exec bridgeukf_postgres psql -U bridgesk -d bridgesk_db -c "SELECT COUNT(*) FROM Session;"
