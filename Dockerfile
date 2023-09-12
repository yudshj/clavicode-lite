FROM node:18.17.1

RUN apt update && \
    apt install -y software-properties-common && \
    add-apt-repository -y ppa:deadsnakes/ppa && \
    apt update && \
    apt install -y python3.8

RUN corepack enable && \
  pnpm add -g pnpm


WORKDIR /ppqs

COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY . ./

RUN pnpm -r install --offline --unsafe-perm && \
  pnpm -r run build 

EXPOSE 3000
ENV PORT 3000
ENV PROD 1
CMD ["pnpm", "--filter", "backend", "start"]
