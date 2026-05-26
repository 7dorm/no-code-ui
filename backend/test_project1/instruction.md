### Steps to Create a Let’s Encrypt Certificate Without Docker

#### 1. Verify DNS Configuration
Ensure your domain resolves correctly.

1. **Check DNS**:
   ```bash
   dig A sigmaltd.space
   dig A www.sigmaltd.space
   dig AAAA sigmaltd.space
   dig AAAA www.sigmaltd.space
   ```
    - `A` records: `77.110.118.222`.
    - `AAAA` records (optional): `2a01:e5c0:4e36::2`. Remove if IPv6 causes issues.

2. **Update DNS (if needed)**:
   In your domain registrar:
    - `A`: `sigmaltd.space` → `77.110.118.222`
    - `A`: `www.sigmaltd.space` → `77.110.118.222`
    - `AAAA` (optional): `sigmaltd.space` → `2a01:e5c0:4e36::2`
    - `AAAA` (optional): `www.sigmaltd.space` → `2a01:e5c0:4e36::2`

3. **Verify Propagation**:
   ```bash
   curl http://sigmaltd.space
   ```
   If Nginx isn’t set up yet, this may fail, but DNS should resolve.

#### 2. Install Dependencies
Install Nginx, Node.js 23.6.1, MySQL, and Certbot on the VPS (Ubuntu assumed).

1. **Update System**:
   ```bash
   sudo apt update
   sudo apt upgrade
   ```

2. **Install Nginx**:
   ```bash
   sudo apt install nginx
   sudo systemctl start nginx
   sudo systemctl enable nginx
   ```
   Verify:
   ```bash
   curl http://77.110.118.222
   ```
   Expect the default Nginx welcome page.

3. **Install Node.js 23.6.1**:
   Use `nvm` to install the exact version:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   source ~/.bashrc
   nvm install 23.6.1
   node -v
   ```
   Should return `v23.6.1`.

4. **Install MySQL**:
   ```bash
   sudo apt install mysql-server
   sudo systemctl start mysql
   sudo systemctl enable mysql
   ```
   Secure MySQL:
   ```bash
   sudo mysql_secure_installation
   ```
   Set up the database and user (matching your `DATABASE_URL`):
   ```bash
   sudo mysql
   ```
   In the MySQL prompt:
   ```sql
   CREATE DATABASE u3079686_dev;
   CREATE USER 'u3079686_sigma'@'localhost' IDENTIFIED BY 'yoursocialsecurityisexpiredpleaseenteritmanually';
   GRANT ALL PRIVILEGES ON u3079686_dev.* TO 'u3079686_sigma'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

5. **Install Certbot**:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

#### 3. Build and Deploy the Frontend
Build the React Native Expo frontend and place the static files for Nginx to serve.

1. **Navigate to Frontend**:
   ```bash
   cd ~/SigmaLTD/frontend
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build for Web**:
   ```bash
   npx expo export:web
   ```
   This creates a `dist/` directory with static files.

4. **Move to Nginx**:
   Copy the `dist/` files to a directory Nginx will serve:
   ```bash
   sudo mkdir -p /var/www/sigmaltd/html
   sudo cp -r ~/SigmaLTD/frontend/dist/* /var/www/sigmaltd/html/
   sudo chown -R www-data:www-data /var/www/sigmaltd/html
   ```

#### 4. Deploy the Backend
Set up the Node.js backend to run as a service.

1. **Navigate to Backend**:
   ```bash
   cd ~/SigmaLTD/backend
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

4. **Run Migrations**:
   ```bash
   npx prisma migrate deploy
   ```

5. **Build the Backend**:
   ```bash
   npm run build
   ```

6. **Run with PM2**:
   Install PM2 to manage the Node.js process:
   ```bash
   npm install -g pm2
   pm2 start npm --name "sigmaltd-backend" -- start
   pm2 save
   pm2 startup
   ```
   Follow the output to enable PM2 on boot.

7. **Verify Backend**:
   ```bash
   curl http://localhost:3000
   ```

#### 5. Configure Nginx
Create an Nginx configuration to serve the frontend, proxy the backend, and handle Let’s Encrypt challenges.

1. **Create Nginx Config**:
   ```bash
   sudo nano /etc/nginx/sites-available/sigmaltd
   ```

2. **Add Configuration**:
   ```nginx
   server {
       listen 80;
       listen [::]:80;
       server_name sigmaltd.space www.sigmaltd.space;

       location /.well-known/acme-challenge/ {
           root /var/www/sigmaltd/html;
           try_files $uri $uri/ =404;
       }

       location / {
           root /var/www/sigmaltd/html;
           try_files $uri $uri/ /index.html;
       }

       location /api/ {
           proxy_pass http://localhost:3000/;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. **Enable Config**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/sigmaltd /etc/nginx/sites-enabled/
   sudo rm /etc/nginx/sites-enabled/default
   ```

4. **Test Config**:
   ```bash
   sudo nginx -t
   ```

5. **Restart Nginx**:
   ```bash
   sudo systemctl restart nginx
   ```

6. **Verify**:
   ```bash
   curl http://sigmaltd.space
   ```
   Expect your frontend’s HTML.

#### 6. Obtain the Certificate
Use Certbot’s `--nginx` authenticator to obtain and configure the certificate.

```bash
sudo certbot --nginx -d sigmaltd.space -d www.sigmaltd.space --email your-email@example.com --agree-tos --no-eff-email
```
- Certbot will modify the Nginx config to include HTTPS and redirect HTTP to HTTPS.
- Answer prompts (e.g., agree to redirect HTTP to HTTPS).

**Expected Output**:
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/sigmaltd.space/fullchain.pem
Key is saved at: /etc/letsencrypt/live/sigmaltd.space/privkey.pem
...
```

#### 7. Verify Nginx Config
Certbot updates `/etc/nginx/sites-available/sigmaltd`. Check it:
```bash
cat /etc/nginx/sites-available/sigmaltd
```
It should include:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name sigmaltd.space www.sigmaltd.space;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name sigmaltd.space www.sigmaltd.space;

    ssl_certificate /etc/letsencrypt/live/sigmaltd.space/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sigmaltd.space/privkey.pem;
    ...
}
```

Restart Nginx:
```bash
sudo systemctl restart nginx
```

#### 8. Verify HTTPS
```bash
curl https://sigmaltd.space
curl https://www.sigmaltd.space
```
Expect your frontend’s HTML.

Test the API:
```bash
curl https://sigmaltd.space/api/
```

Verify certificate:
```bash
openssl s_client -connect sigmaltd.space:443 -servername sigmaltd.space | openssl x509 -noout -text
```

#### 9. Automate Renewal
Let’s Encrypt certificates expire every 90 days. Certbot handles renewals:
```bash
sudo crontab -e
```
Add:
```
0 0 * * * certbot renew --quiet
```

Test renewal:
```bash
sudo certbot renew --dry-run
```

#### 10. Firewall Configuration
Ensure ports `80` and `443` are open:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```
Check your VPS provider’s firewall (e.g., DigitalOcean) for inbound rules.

### Troubleshooting
1. **Certbot Fails**:
    - Check logs:
      ```bash
      sudo cat /var/log/letsencrypt/letsencrypt.log
      ```
    - Test ACME challenge:
      ```bash
      sudo mkdir -p /var/www/sigmaltd/html/.well-known/acme-challenge
      echo "test" > /var/www/sigmaltd/html/.well-known/acme-challenge/test
      curl http://sigmaltd.space/.well-known/acme-challenge/test
      ```

2. **Nginx Errors**:
   ```bash
   sudo nginx -t
   sudo journalctl -u nginx
   ```

3. **Backend Issues**:
   ```bash
   pm2 logs sigmaltd-backend
   ```

4. **DNS Issues**:
   ```bash
   dig A sigmaltd.space
   dig AAAA sigmaltd.space
   ```

### Additional Notes
- **Security**:
    - Update `JWT_SECRET` in `~/SigmaLTD/backend/.env`:
      ```bash
      echo "JWT_SECRET=$(openssl rand -hex 32)" >> ~/SigmaLTD/backend/.env
      ```
    - Restrict MySQL access:
      ```sql
      UPDATE mysql.user SET Host='localhost' WHERE User='u3079686_sigma';
      FLUSH PRIVILEGES;
      ```

- **IPv6**: Included in Nginx config. Remove `[::]:80` and `[::]:443` if not needed.
- **Node.js 23.6.1**: Ensured via `nvm`.

If Certbot fails or you encounter errors, share the Certbot log, Nginx logs, or specific error messages. Let me know if you need help with CI/CD, monitoring, or reverting to Docker!