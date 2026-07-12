def parse(text):
    if not text:
        raise ValueError("empty input")
    return text.strip().split()
