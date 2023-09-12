// Copyright (C) 2022 Clavicode Team
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

import type { Application } from 'express-ws';
import { languageServerHandler } from './language_server.js';

export function handleWs(app: Application) {
  app.ws('/ws/languageServer/:lang', (ws, req) => {
    languageServerHandler(ws, req.params.lang);
    setTimeout(() => ws.close(), 5 * 60 * 1000);
  });
}
