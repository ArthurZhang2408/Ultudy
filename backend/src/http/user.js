export const DEV_USER = '00000000-0000-0000-0000-000000000001';

export function getUserId(req) {
  if (req && typeof req.userId === 'string' && req.userId) {
    return req.userId;
  }

  return DEV_USER;
}

export default getUserId;
