FROM node:20
WORKDIR /usr/src/app
RUN npm install -g yarn
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
RUN yarn build
EXPOSE 3000
CMD ["yarn", "start"]