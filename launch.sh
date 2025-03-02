exec bwrap \
--bind /srv/tilde / \
--unshare-all \
--bind /srv/tilde/home/$1 /home/$1 \
--uid $(id -u $1) \
--gid $(id -g $1) \
$2