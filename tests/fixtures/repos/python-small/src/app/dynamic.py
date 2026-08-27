def call_it(obj):
    return getattr(obj, "run")()
