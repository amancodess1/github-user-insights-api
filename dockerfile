# 1.Base image
FROM node:18

# 2. Set working directory
WORKDIR /app

# 3. Copy files
COPY package.json ./
COPY package-lock.json ./

# 4. Install dependencies
RUN npm install

# 5. Copy the rest of the app files
COPY . .

# 6. Expose a port (if the app runs on a port)
EXPOSE 3000

# 7. Start the applicationa
CMD ["npm", "start"]
