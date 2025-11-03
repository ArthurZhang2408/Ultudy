export const DEV_USER = 'dev-user-001';

export function getUserId(req) {
  if (req && typeof req.userId === 'string' && req.userId) {
    return req.userId;
  }

  return DEV_USER;
}

export default getUserId;
