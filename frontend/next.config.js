/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/dashboard/conciliacao',
        destination: '/dashboard/contabil/conciliacao',
        permanent: false,
      },
      {
        source: '/dashboard/apuracoes',
        destination: '/dashboard/fiscal/apuracao',
        permanent: false,
      },
      {
        source: '/dashboard/folha',
        destination: '/dashboard/dp/folha',
        permanent: false,
      },
      {
        source: '/comunicacao',
        destination: '/dashboard/comunicacao',
        permanent: false,
      },
    ];
  },
};
module.exports = nextConfig;
