FROM node:18-alpine

WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn migrate
RUN yarn build

EXPOSE 80

CMD [ "yarn", "start" ]