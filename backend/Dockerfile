FROM node:18-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       wget \
       ca-certificates \
       gnupg \
       dumb-init \
       chromium \
       fonts-ipafont-gothic \
       fonts-wqy-zenhei \
       fonts-thai-tlwg \
       fonts-kacst \
       fonts-freefont-ttf \
       libxss1 \
    && rm -rf /var/lib/apt/lists/*

ENV DOCKERIZE_VERSION=v0.6.1

RUN wget -q \
    https://github.com/jwilder/dockerize/releases/download/${DOCKERIZE_VERSION}/dockerize-linux-amd64-${DOCKERIZE_VERSION}.tar.gz \
    -O /tmp/dockerize.tar.gz \
    && tar -C /usr/local/bin -xzvf /tmp/dockerize.tar.gz \
    && rm /tmp/dockerize.tar.gz

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_BIN=/usr/bin/chromium

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]

CMD dockerize -wait tcp://${DB_HOST}:3306 \
    && npx sequelize db:migrate \
    && node dist/server.js
