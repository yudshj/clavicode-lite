// Copyright (C) 2021 Clavicode Team
// 
// This file is part of clavicode-backend.
// 
// clavicode-backend is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// clavicode-backend is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with clavicode-backend.  If not, see <http://www.gnu.org/licenses/>.

import * as http from 'node:http';
import express from 'express';
import expressWs from 'express-ws';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import * as path from 'path';

import { handleWs } from './ws/index.js';
import { fileURLToPath } from 'node:url';

const app = express();
const {
  PORT = "3000",
} = process.env;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = http.createServer(app).listen(PORT, () => {
  console.log('server started at http://localhost:' + PORT);
});
expressWs(app, server);

app.use(cors({
  origin: [process.env.HOSTNAME ?? /^localhost(:\d+)?$/],
  credentials: true
}));
app.use((req, res, next) => {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
// We do not use rate limit for now
// app.use(rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100 // limit each IP to 100 requests per windowMs
// }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../../frontend/dist")));

handleWs(app as any);
