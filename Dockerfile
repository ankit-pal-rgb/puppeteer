# Dockerfile

FROM public.ecr.aws/lambda/nodejs:20

WORKDIR /var/task

COPY package*.json ./
RUN npm install

COPY . .

CMD [ "handler.run" ]
