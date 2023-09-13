FROM python:3.8.18

RUN apt-get update && apt-get install -y npm && \
  npm install -g n && \
  n 18.17.1 && \
  corepack enable && corepack prepare pnpm@8.7.5 --activate

WORKDIR /clavicode

COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY . ./

RUN pnpm -r install --offline --unsafe-perm && \
  pnpm -r run build 

EXPOSE 3000
ENV PORT 3000
ENV PROD 1
CMD ["pnpm", "--filter", "clavicode-backend", "start"]
