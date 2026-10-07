# Key-based SSH access to the shop server (Part 8, after Module 30): an ed25519 key, its public
# half in the server's authorized_keys, the server's host key in known_hosts, and a "shop"
# alias in ~/.ssh/config. Needs shop-server first.
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -N "" -C learner@inkwell -f ~/.ssh/id_ed25519 > /dev/null
mkdir -p /srv/hosts/shop/home/learner/.ssh
cp ~/.ssh/id_ed25519.pub /srv/hosts/shop/home/learner/.ssh/authorized_keys
practice-host shop 'chown -R learner:learner /home/learner/.ssh && chmod 700 /home/learner/.ssh && chmod 600 /home/learner/.ssh/authorized_keys'
echo "shop.inkwell.example $(cut -d' ' -f1,2 /srv/hosts/shop/etc/ssh/ssh_host_ed25519_key.pub)" >> ~/.ssh/known_hosts
printf 'Host shop\n    HostName shop.inkwell.example\n    User learner\n' > ~/.ssh/config
chmod 600 ~/.ssh/config
