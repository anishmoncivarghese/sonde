from .util import helper


class Base:
    def describe(self):
        return "base"


class Engine(Base):
    def run(self):
        return self.describe() + helper()
