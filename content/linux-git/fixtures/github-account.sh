# The learner's GitHub account on the practice computer: an SSH key added to GitHub, gh logged
# in (SSH protocol), and GitHub's host key already trusted. Used from Module 19 on.
mkdir -p ~/.ssh ~/.config/gh /srv/git/github.com
ssh-keygen -t ed25519 -C "learner@inkwell.example" -f ~/.ssh/id_ed25519 -N "" > /dev/null
echo "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl" > ~/.ssh/known_hosts
echo "$(cut -d' ' -f1,2 ~/.ssh/id_ed25519.pub) laptop" >> /srv/git/github.com/.authorized_keys
printf 'github.com:\n    user: learner\n    oauth_token: gho_practice_token\n    git_protocol: ssh\n' > ~/.config/gh/hosts.yml
chmod 600 ~/.config/gh/hosts.yml
