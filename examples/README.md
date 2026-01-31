# Examples

Here are some documentation sites that work well with docslurp:

## Popular frameworks

```bash
# React
docslurp https://react.dev/learn --name react-docs

# Next.js
docslurp https://nextjs.org/docs --name nextjs-docs

# Vue
docslurp https://vuejs.org/guide --name vue-docs
```

## API documentation

```bash
# Stripe
docslurp https://docs.stripe.com --name stripe-docs --max-pages 200

# Twilio
docslurp https://www.twilio.com/docs --name twilio-docs
```

## Language docs

```bash
# Python tutorial
docslurp https://docs.python.org/3/tutorial --name python-tutorial

# Rust book
docslurp https://doc.rust-lang.org/book --name rust-book
```

## Tips

- Start with a smaller `--max-pages` value to test before doing a full crawl
- Point at the docs root or a specific section depending on what you need
- Some sites have JavaScript-rendered content that won't get picked up
