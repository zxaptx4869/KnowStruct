"""Operator-only account management commands."""

import argparse
import asyncio
import getpass

from app.database import AsyncSessionFactory, dispose_engine
from app.services.accounts import (
    AccountAlreadyExistsError,
    AccountNotFoundError,
    create_account,
    reset_account_password,
)


def read_confirmed_password() -> str:
    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise ValueError("Passwords do not match")
    return password


async def run_command(command: str, account: str, password: str) -> str:
    async with AsyncSessionFactory() as db, db.begin():
        if command == "create-user":
            user = await create_account(db, account, password)
            return f"Created account: {user.login_name}"
        if command == "reset-password":
            user = await reset_account_password(db, account, password)
            return f"Reset password: {user.login_name}"
    raise ValueError(f"Unsupported command: {command}")


async def async_main(command: str, account: str) -> int:
    try:
        message = await run_command(command, account, read_confirmed_password())
    except (AccountAlreadyExistsError, AccountNotFoundError, ValueError) as exc:
        print(f"Error: {exc}")
        return 1
    finally:
        await dispose_engine()
    print(message)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage KnowStruct accounts")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("create-user", "reset-password"):
        subparser = subparsers.add_parser(command)
        subparser.add_argument("account", help="Login account name")
    args = parser.parse_args()
    return asyncio.run(async_main(args.command, args.account))


if __name__ == "__main__":
    raise SystemExit(main())
