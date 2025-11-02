const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const DEV_USER = '00000000-0000-0000-0000-000000000001';

export function getUserId(req) {
  const header = req?.headers?.['x-user-id'];

  if (typeof header === 'string' && UUID_REGEX.test(header)) {
    return header.toLowerCase();
  }

  return DEV_USER;
}

export default getUserId;
