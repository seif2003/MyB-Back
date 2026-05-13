FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3000

# Run the Prisma seed script at container start, then launch the app.
# Using a shell form so we can run multiple commands in sequence.
CMD ["sh", "-c", "npm run prisma:seed && npm start"]