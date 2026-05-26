cd ~/SigmaLTD/backend

npm install

npx prisma generate

npx prisma migrate deploy

pm2 restart sigmaltd-backend