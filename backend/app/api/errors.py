class NotAuthenticatedError(Exception):
    pass


class DomainError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        **details: object,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


class ResourceNotFoundError(DomainError):
    def __init__(self, resource: str) -> None:
        super().__init__(404, f"{resource}_not_found", "请求的内容不存在")


class ConflictError(DomainError):
    def __init__(self, code: str, message: str, **details: object) -> None:
        super().__init__(409, code, message, **details)
