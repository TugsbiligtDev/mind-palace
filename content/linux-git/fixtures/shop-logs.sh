# A copy of the web shop's logs in ~/logs (Part 6): nginx's access log for two days, the shop's
# orders as JSON, and old app logs. Used by Modules 23 to 27 and the fourth case review.
mkdir -p ~/logs/old
cat > ~/logs/access.log <<'LOG'
203.0.113.7 - - [05/Oct/2026:08:01:12 +0000] "GET / HTTP/1.1" 200 1256 "-" "Mozilla/5.0 (Macintosh)"
203.0.113.7 - - [05/Oct/2026:08:01:13 +0000] "GET /style.css HTTP/1.1" 200 812 "https://inkwell.example/" "Mozilla/5.0 (Macintosh)"
198.51.100.23 - - [05/Oct/2026:08:14:55 +0000] "GET /books/dune HTTP/1.1" 200 2048 "-" "Mozilla/5.0 (iPhone)"
198.51.100.23 - - [05/Oct/2026:08:15:40 +0000] "POST /cart HTTP/1.1" 200 312 "-" "Mozilla/5.0 (iPhone)"
192.0.2.44 - - [05/Oct/2026:09:02:03 +0000] "GET /wp-login.php HTTP/1.1" 404 162 "-" "python-requests/2.31"
192.0.2.44 - - [05/Oct/2026:09:02:04 +0000] "GET /.env HTTP/1.1" 404 162 "-" "python-requests/2.31"
192.0.2.44 - - [05/Oct/2026:09:02:05 +0000] "GET /admin HTTP/1.1" 403 153 "-" "python-requests/2.31"
203.0.113.7 - - [05/Oct/2026:09:30:21 +0000] "GET /books/circe HTTP/1.1" 200 1987 "-" "Mozilla/5.0 (Macintosh)"
198.51.100.23 - - [05/Oct/2026:10:21:06 +0000] "POST /checkout HTTP/1.1" 500 98 "-" "Mozilla/5.0 (iPhone)"
198.51.100.23 - - [05/Oct/2026:10:21:30 +0000] "POST /checkout HTTP/1.1" 200 154 "-" "Mozilla/5.0 (iPhone)"
203.0.113.90 - - [05/Oct/2026:11:05:47 +0000] "GET /books/dune HTTP/1.1" 200 2048 "-" "Mozilla/5.0 (Windows NT 10.0)"
203.0.113.90 - - [05/Oct/2026:11:06:02 +0000] "GET /about HTTP/1.1" 200 1500 "-" "Mozilla/5.0 (Windows NT 10.0)"
192.0.2.44 - - [05/Oct/2026:11:40:10 +0000] "GET /backup.zip HTTP/1.1" 404 162 "-" "python-requests/2.31"
203.0.113.7 - - [05/Oct/2026:12:02:33 +0000] "GET /books/kindred HTTP/1.1" 200 1876 "-" "Mozilla/5.0 (Macintosh)"
203.0.113.7 - - [05/Oct/2026:12:03:01 +0000] "POST /cart HTTP/1.1" 200 298 "-" "Mozilla/5.0 (Macintosh)"
203.0.113.7 - - [05/Oct/2026:12:04:15 +0000] "POST /checkout HTTP/1.1" 200 154 "-" "Mozilla/5.0 (Macintosh)"
198.51.100.23 - - [05/Oct/2026:13:10:44 +0000] "GET /books/the-hobbit HTTP/1.1" 200 2210 "-" "Mozilla/5.0 (iPhone)"
192.0.2.10 - - [06/Oct/2026:02:13:40 +0000] "GET /admin/login HTTP/1.1" 200 640 "-" "curl/8.5.0"
192.0.2.10 - - [06/Oct/2026:02:13:44 +0000] "POST /admin/refund?order=1044 HTTP/1.1" 200 88 "-" "curl/8.5.0"
192.0.2.10 - - [06/Oct/2026:02:14:09 +0000] "POST /admin/refund?order=1046 HTTP/1.1" 200 88 "-" "curl/8.5.0"
192.0.2.10 - - [06/Oct/2026:02:15:31 +0000] "GET /admin/export?table=customers HTTP/1.1" 200 48211 "-" "curl/8.5.0"
203.0.113.7 - - [06/Oct/2026:08:00:31 +0000] "GET / HTTP/1.1" 200 1256 "-" "Mozilla/5.0 (Macintosh)"
203.0.113.90 - - [06/Oct/2026:08:41:12 +0000] "GET /books/circe HTTP/1.1" 200 1987 "-" "Mozilla/5.0 (Windows NT 10.0)"
203.0.113.90 - - [06/Oct/2026:08:41:50 +0000] "POST /checkout HTTP/1.1" 500 98 "-" "Mozilla/5.0 (Windows NT 10.0)"
198.51.100.23 - - [06/Oct/2026:09:12:07 +0000] "GET /books/dune HTTP/1.1" 200 2048 "-" "Mozilla/5.0 (iPhone)"
192.0.2.44 - - [06/Oct/2026:09:15:00 +0000] "GET /phpmyadmin HTTP/1.1" 404 162 "-" "python-requests/2.31"
203.0.113.7 - - [06/Oct/2026:09:20:44 +0000] "GET /books/dune HTTP/1.1" 200 2048 "-" "Mozilla/5.0 (Macintosh)"
203.0.113.7 - - [06/Oct/2026:09:21:02 +0000] "GET /old-page HTTP/1.1" 301 178 "-" "Mozilla/5.0 (Macintosh)"
LOG
cat > ~/logs/orders.json <<'JSON'
[
  {"id": 1044, "customer": "Daniel Novak", "book": "Dune", "price": 9.99, "status": "refunded"},
  {"id": 1045, "customer": "Amara Okafor", "book": "Kindred", "price": 10.50, "status": "delivered"},
  {"id": 1046, "customer": "Kenji Mori", "book": "Dune", "price": 9.99, "status": "refunded"},
  {"id": 1047, "customer": "Liam Chen", "book": "Circe", "price": 12.00, "status": "delivered"},
  {"id": 1048, "customer": "Priya Shah", "book": "The Hobbit", "price": 8.50, "status": "delivered"},
  {"id": 1049, "customer": "Sofia Rossi", "book": "Dune", "price": 9.99, "status": "paid"},
  {"id": 1050, "customer": "Amara Okafor", "book": "Beloved", "price": 11.00, "status": "paid"}
]
JSON
printf '2026-09-01 INFO started\n2026-09-01 DEBUG cache warm\n' > ~/logs/old/app-2026-09-01.log
printf '2026-09-02 INFO started\n' > ~/logs/old/app-2026-09-02.log
printf '2026-09-03 INFO started\n2026-09-03 DEBUG card number 4111-xxxx\n' > ~/logs/old/app-2026-09-03.log
printf '2026-09-04 INFO started\n' > ~/logs/old/app-2026-09-04.log
