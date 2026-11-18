import { ApiBase, Json } from './common_api';

export const BASE_URL = process.env.KATHFLIX_URL ?? 'https://localhost:3000';

export const ADMIN = {
    email: 'admin@kathflix.com',
    password: 'admin123'
}