# Inkwell's web shop server, shop.inkwell.example (Part 8): Ubuntu with nginx serving the
# website (port 80 redirects to 443) and the shop app (Node.js, port 3000, user "inkwell").
# Your account there is "learner", password "bookworm"; no SSH key is set up yet.
practice-host shop
S=/srv/hosts/shop
echo "inkwell:x:998:998:Inkwell shop:/opt/inkwell:/usr/sbin/nologin" >> $S/etc/passwd
echo "inkwell:x:998:" >> $S/etc/group
echo "inkwell:!:20000:0:99999:7:::" >> $S/etc/shadow
mkdir -p $S/opt/inkwell $S/etc/inkwell $S/var/www/inkwell/books $S/var/www/inkwell/downloads $S/etc/nginx/sites-enabled $S/home/learner/backups
printf '// Inkwell shop API (Node.js). Settings: /etc/inkwell/shop.conf\n' > $S/opt/inkwell/shop.js
printf '# Inkwell shop settings\nport=3000\ndb=/var/lib/inkwell/shop.db\n' > $S/etc/inkwell/shop.conf
printf '<!DOCTYPE html>\n<title>Inkwell Books</title>\n<h1>Inkwell Books</h1>\n<p>Second-hand books, posted worldwide.</p>\n' > $S/var/www/inkwell/index.html
printf '<!DOCTYPE html>\n<title>Dune</title>\n<h1>Dune</h1>\n<p class="price">8.99</p>\n' > $S/var/www/inkwell/books/dune.html
printf 'server {\n    listen 80;\n    server_name inkwell.example www.inkwell.example;\n    return 301 https://$host$request_uri;\n}\n\nserver {\n    listen 443 ssl;\n    server_name inkwell.example www.inkwell.example;\n    root /var/www/inkwell;\n}\n' > $S/etc/nginx/sites-enabled/inkwell
printf '[Unit]\nDescription=A high performance web server and a reverse proxy server\nDocumentation=man:nginx(8)\nAfter=network-online.target\n\n[Service]\nType=forking\nExecStart=/usr/sbin/nginx -g '"'"'daemon on; master_process on;'"'"'\n\n[Install]\nWantedBy=multi-user.target\n' > $S/usr/lib/systemd/system/nginx.service
printf '[Unit]\nDescription=Inkwell web shop\nAfter=network.target\n\n[Service]\nUser=inkwell\nExecStart=/usr/bin/node /opt/inkwell/shop.js\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n' > $S/etc/systemd/system/inkwell-shop.service
ln -s /usr/lib/systemd/system/nginx.service $S/etc/systemd/system/multi-user.target.wants/nginx.service
ln -s /etc/systemd/system/inkwell-shop.service $S/etc/systemd/system/multi-user.target.wants/inkwell-shop.service
printf 'Shop server notes (Priya)\n- website files: /var/www/inkwell\n- shop settings: /etc/inkwell/shop.conf\n- nightly backups go to ~/backups\n' > $S/home/learner/NOTES.txt
printf 'id,title,author,price\n1,Dune,Frank Herbert,9.99\n2,Kindred,Octavia Butler,10.50\n3,Circe,Madeline Miller,12.00\n' > $S/var/www/inkwell/downloads/catalog.csv
# Other accounts: Priya (website editor) and "deploy", an old account for automatic deploys.
echo "deploy:x:1002:1002:Deploy account:/home/deploy:/bin/bash" >> $S/etc/passwd
echo "priya:x:1003:1003:Priya Shah:/home/priya:/bin/bash" >> $S/etc/passwd
echo "deploy:x:1002:" >> $S/etc/group
echo "priya:x:1003:" >> $S/etc/group
sed -i 's/^sudo:x:27:learner$/sudo:x:27:learner,deploy/; s/^www-data:x:33:$/www-data:x:33:priya/' $S/etc/group
printf 'deploy:$y$j9T$deploy$hash:20000:0:99999:7:::\npriya:$y$j9T$priya$hash:20000:0:99999:7:::\n' >> $S/etc/shadow
mkdir -p $S/home/deploy/.ssh $S/home/priya $S/opt/.cache
printf 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGr3iFhW9tbcBn0Zk5Lm2pQy8sVxT4aD6eJ1uK7oNcR3 deploy-bot@ci\nssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMarcusReedLaptopKey2025xQ9vLw3nB8tZ1kD4yF7hJ marcus@marcus-laptop\n' > $S/home/deploy/.ssh/authorized_keys
printf '#!/bin/sh\n# sync\n' > $S/opt/.cache/exfil-sync
printf '0 * * * * /opt/.cache/exfil-sync --to old-backup.inkwell.example > /dev/null 2>&1\n' > $S/var/spool/cron/crontabs/deploy
cat > $S/var/log/auth.log <<'LOG'
2026-10-05T23:41:02.551203+00:00 shop sshd[1184]: Failed password for root from 192.0.2.44 port 52114 ssh2
2026-10-05T23:41:05.112839+00:00 shop sshd[1184]: Failed password for root from 192.0.2.44 port 52114 ssh2
2026-10-05T23:41:09.904115+00:00 shop sshd[1184]: Failed password for invalid user admin from 192.0.2.44 port 52130 ssh2
2026-10-05T23:41:13.330201+00:00 shop sshd[1191]: Failed password for invalid user test from 192.0.2.44 port 52141 ssh2
2026-10-06T02:11:47.208114+00:00 shop sshd[2733]: Accepted publickey for deploy from 192.0.2.10 port 40122 ssh2: ED25519 SHA256:mr9QwLsVb0aJ3Fh1uT6kXc2pE8nYzR4dG7sH5jK0lMw
2026-10-06T02:11:47.401552+00:00 shop sshd[2733]: pam_unix(sshd:session): session opened for user deploy(uid=1002) by deploy(uid=0)
2026-10-06T02:12:03.887120+00:00 shop sudo:   deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/crontab -e
2026-10-06T02:16:30.115902+00:00 shop sshd[2733]: pam_unix(sshd:session): session closed for user deploy
2026-10-06T08:02:11.004417+00:00 shop sshd[3120]: Accepted password for priya from 10.0.2.15 port 51200 ssh2
2026-10-06T08:55:40.663001+00:00 shop sshd[3301]: Failed password for root from 192.0.2.44 port 53001 ssh2
LOG
practice-host shop 'chown -R deploy:deploy /home/deploy && chown -R priya:priya /home/priya && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys && chown deploy:crontab /var/spool/cron/crontabs/deploy && chmod 600 /var/spool/cron/crontabs/deploy && chown syslog:adm /var/log/auth.log && chmod 640 /var/log/auth.log && chown -R learner:learner /home/learner'
