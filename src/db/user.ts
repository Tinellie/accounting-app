import { requireUser } from '../lib/auth';
import { openUserDatabase, userDirectory } from '../lib/user-storage';

export async function getUserDb() {
  return openUserDatabase((await requireUser()).user.id);
}

export async function getUserDirectory() {
  return userDirectory((await requireUser()).user.id);
}
