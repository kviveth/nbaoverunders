import Room from './Room';

export default async function Page({ params }) {
  const { code } = await params;
  return <Room code={code} />;
}
